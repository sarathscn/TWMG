create or replace function private.check_record_links() returns trigger language plpgsql security invoker set search_path='' as $$
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
  if exists(select 1 from public.records tx where tx.profile=r.profile and tx.kind='transactions' and tx.data->>'sharedGroupId'=r.id and not exists(select 1 from jsonb_array_elements(coalesce(r.data->'expenses','[]')) arr where arr->>'transactionId'=tx.id)) then raise exception 'A linked shared transaction cannot be removed from the group';end if;
 end if;
 return null;
end $$;
revoke all on function private.check_record_links() from public,anon,authenticated;
