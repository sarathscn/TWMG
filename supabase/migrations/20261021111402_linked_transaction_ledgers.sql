alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check check(kind in ('accounts','transactions','budgets','goals','debts','shared','recurring','categories','paymentMethods','parties'));

-- Run as the authenticated caller: existing record/profile RLS remains authoritative.
create function private.linked_record_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=old.profile) then return old;end if;
 perform 1 from public.profiles where id=old.profile for update;
 if old.kind in ('parties','shared','recurring') and exists(select 1 from public.records where profile=old.profile and kind='transactions' and (data->>'partyId'=old.id or data->>'sharedGroupId'=old.id or data->>'recurringId'=old.id)) then raise exception 'This item has transaction history. Remove or unlink its transactions first.';end if;
 return old;
end $$;
revoke all on function private.linked_record_guard() from public,anon,authenticated;
create trigger linked_record_guard before delete on public.records for each row execute function private.linked_record_guard();

-- A shared account expense is mirrored into its group atomically, never a second account transaction.
create function private.sync_shared_transaction() returns trigger language plpgsql security invoker set search_path='' as $$
declare previous_group text;next_group text;gid text;g jsonb;entries jsonb;entry jsonb;total numeric;pid uuid;tid text;
begin
 if (tg_op='DELETE' and old.kind<>'transactions') or (tg_op<>'DELETE' and new.kind<>'transactions') then return null;end if;
 if tg_op<>'INSERT' then previous_group=old.data->>'sharedGroupId';pid=old.profile;tid=old.id;end if;
 if tg_op<>'DELETE' then next_group=new.data->>'sharedGroupId';pid=new.profile;tid=new.id;end if;
 if not exists(select 1 from public.profiles where id=pid) then return null;end if;
 for gid in select distinct x from unnest(array[previous_group,next_group]) x where x is not null loop
  select data into g from public.records where id=gid and profile=pid and kind='shared' for update;
  if g is null then raise exception 'Shared group not found';end if;
  entries=g->'expenses';
  if entries is null then
   entries=case when coalesce((g->>'amount')::numeric,0)>0 then jsonb_build_array(jsonb_build_object('id','opening-'||gid,'name','Existing group expenses','amount',g->'amount','date',coalesce(nullif(g->>'due',''),current_date::text),'paidBy','')) else '[]'::jsonb end;
  end if;
  select coalesce(jsonb_agg(e),'[]'::jsonb) into entries from jsonb_array_elements(entries) e where coalesce(e->>'transactionId','')<>tid;
  if gid=next_group then
   entry=jsonb_strip_nulls(jsonb_build_object('id','tx-'||tid,'transactionId',tid,'name',new.data->>'name','amount',new.data->'amount','date',new.data->>'date','paidBy',new.data->>'paidBy','participants',new.data->'participants','notes',new.data->>'notes'));
   entries=entries||jsonb_build_array(entry);
  end if;
  select coalesce(sum((e->>'amount')::numeric),0) into total from jsonb_array_elements(entries) e;
  if total<coalesce((g->>'paid')::numeric,0) then raise exception 'Group total cannot be lower than recorded settlements';end if;
  if total>1e13 or jsonb_array_length(entries)>100 then raise exception 'Shared group limit exceeded';end if;
  update public.records set data=g||jsonb_build_object('expenses',entries,'amount',total) where id=gid and profile=pid and kind='shared';
 end loop;
 return null;
end $$;
revoke all on function private.sync_shared_transaction() from public,anon,authenticated;
create trigger sync_shared_transaction after insert or update or delete on public.records for each row execute function private.sync_shared_transaction();

-- Deferred checks also support atomic multi-row backup imports, regardless of row order.
create function private.check_record_links() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.records;target jsonb;acc jsonb;base text;expected text;e jsonb;t jsonb;field text;target_kind text;
begin
 select * into r from public.records where id=new.id and profile=new.profile;
 if not found then return null;end if;
 if r.kind='transactions' then
  if (case when nullif(r.data->>'partyId','') is null then 0 else 1 end)+(case when nullif(r.data->>'sharedGroupId','') is null then 0 else 1 end)+(case when nullif(r.data->>'recurringId','') is null then 0 else 1 end)>1 then raise exception 'Choose one transaction link';end if;
  foreach field in array array['partyId','sharedGroupId','recurringId'] loop
   if nullif(r.data->>field,'') is not null then
    target_kind=case field when 'partyId' then 'parties' when 'sharedGroupId' then 'shared' else 'recurring' end;
    select data into target from public.records where id=r.data->>field and profile=r.profile and kind=target_kind;
    if target is null then raise exception 'Linked item must belong to this profile';end if;
   end if;
  end loop;
  if nullif(r.data->>'partyId','') is not null then
   expected=case r.data->>'debtAction' when 'lend' then 'expense' when 'repay' then 'expense' when 'borrow' then 'income' when 'collect' then 'income' end;
   if expected is null or expected<>r.data->>'type' then raise exception 'Invalid debt direction';end if;
  elsif nullif(r.data->>'debtAction','') is not null then raise exception 'Debt party is required';end if;
  if nullif(r.data->>'sharedGroupId','') is not null or nullif(r.data->>'recurringId','') is not null then
   select data into acc from public.records where id=r.data->>'account' and profile=r.profile and kind='accounts';
   select currency into base from public.profiles where id=r.profile;
   if r.data->>'type'<>'expense' or acc->>'currency'<>base then raise exception 'Use an expense account in the profile currency';end if;
  end if;
  if nullif(r.data->>'sharedGroupId','') is not null then
   select data into target from public.records where id=r.data->>'sharedGroupId' and profile=r.profile and kind='shared';
   if target->'memberNames' is null or not (target->'memberNames' ? coalesce(r.data->>'paidBy','')) or coalesce(jsonb_array_length(r.data->'participants'),0)=0 then raise exception 'Choose group payer and split members';end if;
   if exists(select 1 from jsonb_array_elements_text(r.data->'participants') n where not(target->'memberNames' ? n)) or (select count(*)<>count(distinct n) from jsonb_array_elements_text(r.data->'participants') n) then raise exception 'Invalid split members';end if;
  end if;
 elsif r.kind='shared' then
  for e in select value from jsonb_array_elements(coalesce(r.data->'expenses','[]')) where value ? 'transactionId' loop
   select data into t from public.records where id=e->>'transactionId' and profile=r.profile and kind='transactions';
   if t is null or t->>'sharedGroupId' is distinct from r.id or e->'amount' is distinct from t->'amount' or e->>'name' is distinct from t->>'name' or e->>'date' is distinct from t->>'date' or e->>'paidBy' is distinct from t->>'paidBy' or e->'participants' is distinct from t->'participants' or coalesce(e->>'notes','')<>coalesce(t->>'notes','') then raise exception 'Edit linked shared expenses from their account transaction';end if;
  end loop;
  if exists(select 1 from public.records tx where tx.profile=r.profile and tx.kind='transactions' and tx.data->>'sharedGroupId'=r.id and not exists(select 1 from jsonb_array_elements(coalesce(r.data->'expenses','[]')) e where e->>'transactionId'=tx.id)) then raise exception 'A linked shared transaction cannot be removed from the group';end if;
 end if;
 return null;
end $$;
revoke all on function private.check_record_links() from public,anon,authenticated;
create constraint trigger check_record_links after insert or update on public.records deferrable initially deferred for each row execute function private.check_record_links();
