create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.profiles (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade,
 slot smallint not null check(slot between 0 and 2), name text not null check(length(name) between 1 and 60),
 country text not null, currency text not null check(currency in ('INR','SAR','USD','EUR','AED','GBP')),
 username text check(username is null or username ~ '^[a-z0-9._]{3,30}$'),bio text check(length(bio)<=160),
 avatar text check(avatar is null or (length(avatar)<=60000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')),
 emoji text, color text, unique(owner,slot),unique(owner,username)
);
create table public.records (
 id text primary key, profile uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('accounts','transactions','budgets','goals','debts','shared','recurring')),
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id'=id)
);
create index records_profile_kind on public.records(profile,kind);
create table public.history (
 id uuid primary key default gen_random_uuid(),profile uuid not null references public.profiles(id) on delete cascade,
 record text not null,kind text not null,action text not null,before text,after text,created timestamptz not null default now()
);
create index history_profile_record_created on public.history(profile,record,created desc);
alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.history enable row level security;
revoke all on public.profiles,public.records,public.history from anon,authenticated;
grant select,insert on public.profiles to authenticated;
grant update(name,country,username,bio,avatar,emoji,color) on public.profiles to authenticated;
grant select,insert,update,delete on public.records to authenticated;
grant select on public.history to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(owner=(select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check(owner=(select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
create policy records_read on public.records for select to authenticated using(exists(select 1 from public.profiles p where p.id=profile and p.owner=(select auth.uid())));
create policy records_insert on public.records for insert to authenticated with check(exists(select 1 from public.profiles p where p.id=profile and p.owner=(select auth.uid())));
create policy records_update on public.records for update to authenticated using(exists(select 1 from public.profiles p where p.id=profile and p.owner=(select auth.uid()))) with check(exists(select 1 from public.profiles p where p.id=profile and p.owner=(select auth.uid())));
create policy records_delete on public.records for delete to authenticated using(exists(select 1 from public.profiles p where p.id=profile and p.owner=(select auth.uid())));
create policy history_read on public.history for select to authenticated using(exists(select 1 from public.profiles p where p.id=profile and p.owner=(select auth.uid())));
create function private.record_integrity() returns trigger language plpgsql security invoker set search_path='' as $$
declare account_data jsonb; target_data jsonb;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.profile<>old.profile or new.kind<>old.kind) then raise exception 'Record identity cannot change';end if;
 if tg_op='DELETE' then
  if old.kind='accounts' and exists(select 1 from public.records where profile=old.profile and kind='transactions' and (data->>'account'=old.id or data->>'to'=old.id)) then raise exception 'This account has transaction history';end if;
  return old;
 end if;
 perform 1 from public.profiles where id=new.profile for update;
 if new.kind='transactions' then
  if new.data->>'type' not in ('income','expense','transfer') or coalesce((new.data->>'amount')::numeric,0)<=0 then raise exception 'Invalid transaction';end if;
  select data into account_data from public.records where id=new.data->>'account' and profile=new.profile and kind='accounts';
  if account_data is null then raise exception 'Account not found';end if;
  if new.data->>'type'='transfer' then
   if new.data->>'account'=new.data->>'to' then raise exception 'Choose different accounts';end if;
   select data into target_data from public.records where id=new.data->>'to' and profile=new.profile and kind='accounts';
   if target_data is null then raise exception 'Destination account not found';end if;
   if account_data->>'currency'<>target_data->>'currency' and coalesce((new.data->>'received')::numeric,0)<=0 then raise exception 'Received amount is required';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.record_integrity() from public,anon,authenticated;
create trigger record_integrity before insert or update or delete on public.records for each row execute function private.record_integrity();
-- Private trigger writes immutable audit rows atomically with the record mutation.
create function private.audit_record() returns trigger language plpgsql security definer set search_path='' as $$
declare profile_id uuid;record_id text;record_kind text;
begin
 profile_id=case when tg_op='DELETE' then old.profile else new.profile end;
 record_id=case when tg_op='DELETE' then old.id else new.id end;
 record_kind=case when tg_op='DELETE' then old.kind else new.kind end;
 if auth.uid() is null or not exists(select 1 from public.profiles where id=profile_id and owner=auth.uid()) then raise exception 'Unauthorized audit mutation';end if;
 insert into public.history(profile,record,kind,action,before,after) values(profile_id,record_id,record_kind,case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,case when tg_op<>'INSERT' then old.data::text end,case when tg_op<>'DELETE' then new.data::text end);
 return null;
end $$;
revoke all on function private.audit_record() from public,anon,authenticated;
create trigger audit_record after insert or update or delete on public.records for each row execute function private.audit_record();
