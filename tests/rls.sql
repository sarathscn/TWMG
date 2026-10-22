-- Run in Supabase SQL Editor; the transaction rolls back all test rows.
begin;
insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','twmg-a@example.invalid'),
('22222222-2222-4222-8222-222222222222','twmg-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.profiles(id,owner,slot,name,country,currency)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',0,'Test','India','INR');
insert into public.records(id,profile,kind,data)
values('account-test','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accounts','{"id":"account-test","name":"Test cash","currency":"INR","type":"Cash","balance":0}');
do $$begin
 if (select count(*) from public.history where record='account-test')<>1 then raise exception 'Audit failed';end if;
 begin
  insert into public.profiles(owner,slot,name,country,currency) values(auth.uid(),3,'Fourth','India','INR');
  raise exception 'Profile limit failed';
 exception when check_violation then null;end;
end$$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 if exists(select 1 from public.profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') or exists(select 1 from public.records where id='account-test') or exists(select 1 from public.history where record='account-test') then raise exception 'Isolation failed';end if;
 begin
  insert into public.records(id,profile,kind,data) values('intruder','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accounts','{"id":"intruder"}');
  raise exception 'Cross-user write allowed';
 exception when insufficient_privilege then null;end;
end$$;
rollback;
