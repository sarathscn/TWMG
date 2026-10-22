alter table public.profiles drop constraint profiles_currency_check;
alter table public.profiles add constraint profiles_currency_check check(currency in ('INR','BHD','SAR','USD','EUR','AED','GBP'));
alter table public.profiles add column options_initialized boolean not null default false;
alter table public.profiles add column payment_countries text[] not null default '{}';
alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check check(kind in ('accounts','transactions','budgets','goals','debts','shared','recurring','categories','paymentMethods'));
create table public.account_settings(user_id uuid primary key references auth.users(id) on delete cascade,username text unique check(username is null or username ~ '^[a-z0-9_]{3,30}$'),display_name text not null default '' check(length(display_name)<=60));
alter table public.account_settings enable row level security;
revoke all on public.account_settings from anon,authenticated;
grant select,insert on public.account_settings to authenticated;
grant update(username,display_name) on public.account_settings to authenticated;
create policy account_settings_read on public.account_settings for select to authenticated using(user_id=(select auth.uid()));
create policy account_settings_insert on public.account_settings for insert to authenticated with check(user_id=(select auth.uid()));
create policy account_settings_update on public.account_settings for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant update(currency,options_initialized,payment_countries) on public.profiles to authenticated;
grant delete on public.profiles to authenticated;
create policy profiles_delete on public.profiles for delete to authenticated using(owner=(select auth.uid()));
create function private.profile_currency_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin if new.currency<>old.currency and exists(select 1 from public.records where profile=old.id and kind not in ('categories','paymentMethods')) then raise exception 'Create a new profile to change base currency after financial records exist';end if;return new;end$$;
revoke all on function private.profile_currency_guard() from public,anon,authenticated;
create trigger profile_currency_guard before update on public.profiles for each row execute function private.profile_currency_guard();
create function public.initialize_profile_options(target uuid,category_rows jsonb,method_rows jsonb) returns void language plpgsql security invoker set search_path='' as $$declare p public.profiles;entry jsonb;begin
 select * into p from public.profiles where id=target and owner=auth.uid() for update;if p.id is null then raise exception 'Profile not found';end if;
 if jsonb_array_length(category_rows)>100 or jsonb_array_length(method_rows)>30 then raise exception 'Too many options';end if;
 if not p.options_initialized then for entry in select * from jsonb_array_elements(category_rows) loop insert into public.records(id,profile,kind,data) values(entry->>'id',target,'categories',entry);end loop;end if;
 if not(p.country=any(p.payment_countries)) then for entry in select * from jsonb_array_elements(method_rows) loop insert into public.records(id,profile,kind,data) values(entry->>'id',target,'paymentMethods',entry);end loop;end if;
 update public.profiles set options_initialized=true,payment_countries=array(select distinct unnest(p.payment_countries||array[p.country])) where id=target;
 end$$;
revoke all on function public.initialize_profile_options(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.initialize_profile_options(uuid,jsonb,jsonb) to authenticated;
-- Privileged lookup is callable only by the server-side Edge Function's service role.
create function private.login_email(login_name text) returns text language sql stable security definer set search_path='' as $$select u.email from public.account_settings s join auth.users u on u.id=s.user_id where s.username=lower(login_name)$$;
revoke all on function private.login_email(text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.login_email(text) to service_role;
create function public.resolve_login_email(login_name text) returns text language sql stable security invoker set search_path='' as $$select private.login_email(login_name)$$;
revoke all on function public.resolve_login_email(text) from public,anon,authenticated;
grant execute on function public.resolve_login_email(text) to service_role;
create table private.login_limits(key text primary key,attempts integer not null default 0,started timestamptz not null default now());
create function private.allow_login(bucket text) returns boolean language plpgsql security definer set search_path='' as $$declare count integer;begin insert into private.login_limits(key,attempts) values(bucket,1) on conflict(key) do update set attempts=case when private.login_limits.started<now()-interval '15 minutes' then 1 else private.login_limits.attempts+1 end,started=case when private.login_limits.started<now()-interval '15 minutes' then now() else private.login_limits.started end returning attempts into count;return count<=10;end$$;
revoke all on function private.allow_login(text) from public,anon,authenticated;
grant execute on function private.allow_login(text) to service_role;
create function public.allow_login(bucket text) returns boolean language sql security invoker set search_path='' as $$select private.allow_login(bucket)$$;
revoke all on function public.allow_login(text) from public,anon,authenticated;
grant execute on function public.allow_login(text) to service_role;
create or replace function private.record_integrity() returns trigger language plpgsql security invoker set search_path='' as $$
declare account_data jsonb; target_data jsonb;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.profile<>old.profile or new.kind<>old.kind) then raise exception 'Record identity cannot change';end if;
 if tg_op='DELETE' then
  if not exists(select 1 from public.profiles where id=old.profile) then return old;end if;
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
create or replace function private.audit_record() returns trigger language plpgsql security definer set search_path='' as $$
declare profile_id uuid;record_id text;record_kind text;
begin
 profile_id=case when tg_op='DELETE' then old.profile else new.profile end;
 record_id=case when tg_op='DELETE' then old.id else new.id end;
 record_kind=case when tg_op='DELETE' then old.kind else new.kind end;
 if not exists(select 1 from public.profiles where id=profile_id) then return null;end if;
 if auth.uid() is null or not exists(select 1 from public.profiles where id=profile_id and owner=auth.uid()) then raise exception 'Unauthorized audit mutation';end if;
 insert into public.history(profile,record,kind,action,before,after) values(profile_id,record_id,record_kind,case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,case when tg_op<>'INSERT' then old.data::text end,case when tg_op<>'DELETE' then new.data::text end);
 return null;
end $$;
