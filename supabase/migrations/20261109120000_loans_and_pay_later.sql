-- Loans and Pay Later, stored one record each with their payments inside the record. A payment and the
-- balance it changes therefore land in one atomic row write, and the audit trigger logs every change.
-- Safe on existing data: nothing here rewrites rows, and the size check only applies to new writes.
alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check check(kind in ('accounts','transactions','budgets','goals','debts','shared','recurring','categories','paymentMethods','parties','loans','payLater'));
-- Records are written through the API, but signed-in users can also reach this table directly with the
-- public key. These guards hold on that path too, so a balance can never be set by hand.
alter table public.records add constraint records_data_size check(octet_length(data::text)<=500000) not valid;
create function private.guard_credit_record() returns trigger language plpgsql security invoker set search_path='' as $$
declare
 payment jsonb; previous jsonb; matched jsonb; total numeric := 0; seen text[] := '{}'; amount numeric; payment_amount numeric; payment_id text;
begin
 if new.kind not in ('loans','payLater') then return new; end if;
 if new.data ? 'outstanding' or new.data ? 'status' or new.data ? 'paid' then raise exception 'Balances are calculated from payments and cannot be set directly.' using errcode='23514'; end if;
 if jsonb_typeof(new.data->'amount') is distinct from 'number' then raise exception 'Enter the amount owed.' using errcode='23514'; end if;
 amount := (new.data->>'amount')::numeric;
 if amount<=0 or amount<>trunc(amount) or amount>1000000000000 then raise exception 'Enter a valid amount.' using errcode='23514'; end if;
 if new.data ? 'payments' and jsonb_typeof(new.data->'payments')<>'array' then raise exception 'Payments are not valid.' using errcode='23514'; end if;
 for payment in select value from jsonb_array_elements(coalesce(new.data->'payments','[]'::jsonb)) loop
  payment_id := payment->>'id';
  if nullif(payment_id,'') is null or payment_id=any(seen) then raise exception 'Each payment must be unique.' using errcode='23514'; end if;
  seen := seen || payment_id;
  if jsonb_typeof(payment->'amount') is distinct from 'number' then raise exception 'Enter a valid payment amount.' using errcode='23514'; end if;
  payment_amount := (payment->>'amount')::numeric;
  if payment_amount<=0 or payment_amount<>trunc(payment_amount) then raise exception 'Enter a valid payment amount.' using errcode='23514'; end if;
  if coalesce(payment->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid payment date.' using errcode='23514'; end if;
  if (payment->'void') is distinct from 'true'::jsonb then total := total+payment_amount; end if;
 end loop;
 if total>amount then raise exception 'Payments cannot be more than the amount owed.' using errcode='23514'; end if;
 -- Recorded payments are permanent. A mistake is reversed, which keeps the entry in the history.
 if tg_op='UPDATE' then
  for previous in select value from jsonb_array_elements(coalesce(old.data->'payments','[]'::jsonb)) loop
   select value into matched from jsonb_array_elements(coalesce(new.data->'payments','[]'::jsonb)) as p(value) where p.value->>'id'=previous->>'id' limit 1;
   if matched is null then raise exception 'A recorded payment cannot be removed. Reverse it instead.' using errcode='23514'; end if;
   if (matched-'void') is distinct from (previous-'void') then raise exception 'A recorded payment cannot be changed. Reverse it instead.' using errcode='23514'; end if;
   if (previous->'void')='true'::jsonb and (matched->'void') is distinct from 'true'::jsonb then raise exception 'A reversed payment cannot be restored.' using errcode='23514'; end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function private.guard_credit_record() from public,anon,authenticated;
create trigger guard_credit_record before insert or update on public.records for each row execute function private.guard_credit_record();
