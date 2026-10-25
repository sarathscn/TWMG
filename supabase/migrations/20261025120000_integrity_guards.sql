-- Database-level guards for rules the API already checks, so they also hold under
-- concurrent requests, backup imports and direct PostgREST writes.
-- Safe on existing data: nothing here rewrites or validates rows that already exist.

-- 1. Cash, Wallet and Digital Wallet balances can't go below zero.
-- Deferred to commit so multi-row writes (imports, linked shared expenses) are judged on
-- their final state. The profile row lock serialises concurrent writers on one profile,
-- so two requests can't both pass a check and overdraw an account together.
-- Only changes that make such a balance lower are rejected, so legacy negative balances
-- can still be repaired. Runs as the caller: RLS keeps every lookup inside their profile.
create function private.guard_non_negative_balances() returns trigger language plpgsql security invoker set search_path='' as $$
declare
 pid uuid; ids text[]; acc record; bal numeric; delta numeric; old_open numeric;
begin
 pid := case when tg_op='DELETE' then old.profile else new.profile end;
 if not exists(select 1 from public.profiles where id=pid) then return null; end if;
 perform 1 from public.profiles where id=pid for update;
 ids := array_remove(array[
  case when tg_op<>'INSERT' and old.kind='transactions' then old.data->>'account' end,
  case when tg_op<>'INSERT' and old.kind='transactions' then old.data->>'to' end,
  case when tg_op<>'DELETE' and new.kind='transactions' then new.data->>'account' end,
  case when tg_op<>'DELETE' and new.kind='transactions' then new.data->>'to' end,
  case when tg_op<>'DELETE' and new.kind='accounts' then new.id end], null);
 if ids is null or cardinality(ids)=0 then return null; end if;
 for acc in select id, data from public.records where profile=pid and kind='accounts' and id=any(ids) and data->>'type' in ('Cash','Wallet','Digital Wallet') loop
  select coalesce((acc.data->>'opening')::numeric,0) + coalesce(sum(
   (case when t.data->>'account'=acc.id then case when t.data->>'type'='income' then (t.data->>'amount')::numeric else -(t.data->>'amount')::numeric end else 0 end)
   + (case when t.data->>'type'='transfer' and t.data->>'to'=acc.id then coalesce((t.data->>'received')::numeric,(t.data->>'amount')::numeric) else 0 end)),0)
   into bal from public.records t where t.profile=pid and t.kind='transactions';
  if bal >= 0 then continue; end if;
  -- How much this one row moved the balance.
  delta := 0;
  if tg_op<>'DELETE' and new.kind='transactions' then
   delta := delta + (case when new.data->>'account'=acc.id then case when new.data->>'type'='income' then (new.data->>'amount')::numeric else -(new.data->>'amount')::numeric end else 0 end)
    + (case when new.data->>'type'='transfer' and new.data->>'to'=acc.id then coalesce((new.data->>'received')::numeric,(new.data->>'amount')::numeric) else 0 end);
  end if;
  if tg_op<>'INSERT' and old.kind='transactions' then
   delta := delta - ((case when old.data->>'account'=acc.id then case when old.data->>'type'='income' then (old.data->>'amount')::numeric else -(old.data->>'amount')::numeric end else 0 end)
    + (case when old.data->>'type'='transfer' and old.data->>'to'=acc.id then coalesce((old.data->>'received')::numeric,(old.data->>'amount')::numeric) else 0 end));
  end if;
  if tg_op<>'DELETE' and new.kind='accounts' and new.id=acc.id then
   old_open := case when tg_op='UPDATE' and old.data->>'type' in ('Cash','Wallet','Digital Wallet') then coalesce((old.data->>'opening')::numeric,0) else null end;
   -- A new cash account, or an account switched to a cash type, must not start negative.
   delta := case when old_open is null then -1 else coalesce((new.data->>'opening')::numeric,0) - old_open end;
  end if;
  if delta < 0 then
   raise exception 'This would take % below zero. Cash and wallet balances can''t be negative.', acc.data->>'name' using errcode='23514';
  end if;
 end loop;
 return null;
end $$;
revoke all on function private.guard_non_negative_balances() from public,anon,authenticated;
create constraint trigger guard_non_negative_balances after insert or update or delete on public.records deferrable initially deferred for each row execute function private.guard_non_negative_balances();

-- 2. One name per profile for categories and parties, and per country for payment methods.
-- Only new or renamed rows are checked, so existing duplicates never block this migration.
-- Runs after record_integrity, which already holds the profile row lock.
create function private.guard_unique_names() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind not in ('categories','parties','paymentMethods') then return new; end if;
 if tg_op='UPDATE' and lower(old.data->>'name') is not distinct from lower(new.data->>'name') and (old.data->>'country') is not distinct from (new.data->>'country') then return new; end if;
 if exists(select 1 from public.records r where r.profile=new.profile and r.kind=new.kind and r.id<>new.id
  and lower(trim(r.data->>'name'))=lower(trim(new.data->>'name'))
  and (new.kind<>'paymentMethods' or (r.data->>'country') is not distinct from (new.data->>'country'))) then
  raise exception 'This name already exists.' using errcode='23505';
 end if;
 return new;
end $$;
revoke all on function private.guard_unique_names() from public,anon,authenticated;
create trigger record_unique_names before insert or update on public.records for each row execute function private.guard_unique_names();

-- 3. A transaction's payment method must belong to the same profile.
-- Deferred: backup imports insert payment methods after the transactions that use them.
-- A method deleted later keeps working as a name snapshot, so only new links are checked.
create function private.guard_payment_method_link() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.records;
begin
 select * into r from public.records where id=new.id and profile=new.profile;
 if not found or r.kind<>'transactions' or nullif(r.data->>'paymentMethod','') is null then return null; end if;
 if tg_op='UPDATE' and (old.data->>'paymentMethod') is not distinct from (r.data->>'paymentMethod') then return null; end if;
 if not exists(select 1 from public.records m where m.profile=r.profile and m.kind='paymentMethods' and m.id=r.data->>'paymentMethod') then
  raise exception 'Choose a payment method from this profile.' using errcode='23503';
 end if;
 return null;
end $$;
revoke all on function private.guard_payment_method_link() from public,anon,authenticated;
create constraint trigger guard_payment_method_link after insert or update on public.records deferrable initially deferred for each row execute function private.guard_payment_method_link();
