// Applies every TWMG migration to a real PostgreSQL 17 (PGlite) with Supabase-like stubs,
// then exercises RLS and integrity rules as signed-in users. Usage: node run.mjs <repo>
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const repo = process.argv[2];
const db = new PGlite();
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name + ' ' + extra); } };
await db.exec(`
 create role anon nologin; create role authenticated nologin; create role service_role nologin;
 create schema auth; create table auth.users(id uuid primary key, email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to public;
 grant usage on schema public to anon, authenticated, service_role;`);
for (const f of readdirSync(repo + '/supabase/migrations').sort()) { await db.exec(readFileSync(repo + '/supabase/migrations/' + f, 'utf8')); console.log('applied ' + f); }
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', P2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
await db.exec(`insert into auth.users values ('${U1}','u1@test'),('${U2}','u2@test');`);
// Run SQL as a signed-in user inside one transaction (deferred triggers fire at commit).
async function as(user, sql) {
  try { await db.exec(`begin; set local role authenticated; set local request.jwt.claim.sub='${user}'; ${sql}; commit;`); return null; }
  catch (e) { await db.exec('rollback').catch(() => {}); return e.message; }
}
const rec = (id, profile, kind, data) => `insert into public.records(id,profile,kind,data) values ('${id}','${profile}','${kind}','${JSON.stringify({ ...data, id }).replace(/'/g, "''")}'::jsonb)`;
const upd = (id, data) => `update public.records set data='${JSON.stringify({ ...data, id }).replace(/'/g, "''")}'::jsonb where id='${id}'`;
const tx = (account, amount, type = 'expense', extra = {}) => ({ name: 'T', type, amount, account, category: 'Other', date: '2026-10-20', ...extra });
const neg = m => !!m && /below zero/.test(m);

console.log('\nSetup');
ok('user 1 creates own profile', !(await as(U1, `insert into public.profiles(id,owner,slot,name,country,currency) values ('${P1}','${U1}',0,'P1','India','INR')`)));
ok('user 2 creates own profile', !(await as(U2, `insert into public.profiles(id,owner,slot,name,country,currency) values ('${P2}','${U2}',0,'P2','India','INR')`)));
ok('user 2 cannot create a profile owned by user 1', !!(await as(U2, `insert into public.profiles(owner,slot,name,country,currency) values ('${U1}',1,'X','India','INR')`)));
ok('cash and bank accounts created', !(await as(U1, `${rec('cash', P1, 'accounts', { name: 'Cash wallet', type: 'Cash', currency: 'INR', opening: 2000 })}; ${rec('bank', P1, 'accounts', { name: 'Bank', type: 'Bank account', currency: 'INR', opening: 0 })}`)));

console.log('\nNon-negative cash and wallet balances');
ok('spending within the cash balance is allowed', !(await as(U1, rec('t1', P1, 'transactions', tx('cash', 1500)))));
let e = await as(U1, rec('t2', P1, 'transactions', tx('cash', 600)));
ok('spending past the cash balance is rejected', neg(e), e);
ok('editing an expense within the balance is allowed', !(await as(U1, upd('t1', tx('cash', 1900)))));
e = await as(U1, upd('t1', tx('cash', 2100)));
ok('editing an expense past the balance is rejected', neg(e), e);
ok('income into cash is allowed', !(await as(U1, rec('in1', P1, 'transactions', tx('cash', 500, 'income')))));
ok('spending funded by that income is allowed', !(await as(U1, rec('t3', P1, 'transactions', tx('cash', 500)))));
e = await as(U1, `delete from public.records where id='in1'`);
ok('deleting the income that funded spending is rejected', neg(e), e);
e = await as(U1, rec('tr1', P1, 'transactions', tx('cash', 5000, 'transfer', { to: 'bank' })));
ok('transferring more cash than held is rejected', neg(e), e);
ok('transferring from bank into cash is allowed', !(await as(U1, rec('tr2', P1, 'transactions', tx('bank', 3000, 'transfer', { to: 'cash' })))));
ok('bank accounts may go negative (overdraft)', !(await as(U1, rec('t4', P1, 'transactions', tx('bank', 99999)))));
e = await as(U1, rec('w2', P1, 'accounts', { name: 'Neg wallet', type: 'Wallet', currency: 'INR', opening: -1 }));
ok('a new wallet cannot start below zero', neg(e), e);
e = await as(U1, upd('bank', { name: 'Bank', type: 'Cash', currency: 'INR', opening: 0 }));
ok('an overdrawn bank cannot be switched to a cash type', neg(e), e);
ok('one transaction with several rows is judged on its final state', !(await as(U1, `${rec('t5', P1, 'transactions', tx('cash', 3000))}; ${rec('in2', P1, 'transactions', tx('cash', 3000, 'income'))}`)));
await db.exec(`set request.jwt.claim.sub='${U1}'`); await db.exec('alter table public.records disable trigger guard_non_negative_balances'); await db.exec(`insert into public.records values ('legacy','${P1}','accounts','{"id":"legacy","name":"Old cash","type":"Cash","currency":"INR","opening":-100}')`); await db.exec('alter table public.records enable trigger guard_non_negative_balances'); await db.exec('reset request.jwt.claim.sub');
ok('a legacy negative cash balance can still be topped up', !(await as(U1, rec('in3', P1, 'transactions', tx('legacy', 50, 'income')))));
e = await as(U1, rec('t6', P1, 'transactions', tx('legacy', 10)));
ok('a legacy negative cash balance cannot get worse', neg(e), e);

console.log('\nUnique names');
ok('category created', !(await as(U1, rec('c1', P1, 'categories', { name: 'Food', color: '#2d634a' }))));
e = await as(U1, rec('c2', P1, 'categories', { name: ' food ', color: '#2d634a' }));
ok('duplicate category name (case/space-insensitive) is rejected', /already exists/.test(e || ''), e);
ok('the same category name in another profile is allowed', !(await as(U2, rec('c3', P2, 'categories', { name: 'Food', color: '#2d634a' }))));
ok('renaming a category to a new name is allowed', !(await as(U1, upd('c1', { name: 'Groceries', color: '#2d634a' }))));
ok('payment method Cash for India created', !(await as(U1, rec('m1', P1, 'paymentMethods', { name: 'Cash', country: 'India', enabled: true, custom: false }))));
ok('payment method Cash for Bahrain is allowed (other country)', !(await as(U1, rec('m2', P1, 'paymentMethods', { name: 'Cash', country: 'Bahrain', enabled: true, custom: false }))));
e = await as(U1, rec('m3', P1, 'paymentMethods', { name: 'CASH', country: 'India', enabled: true, custom: true }));
ok('duplicate payment method in the same country is rejected', /already exists/.test(e || ''), e);
e = await as(U1, `${rec('p1', P1, 'parties', { name: 'Arjun' })}; ${rec('p2', P1, 'parties', { name: 'arjun' })}`);
ok('duplicates inside one multi-row write are rejected', /already exists/.test(e || ''), e);

console.log('\nPayment method links');
ok('a transaction can use its own profile’s method', !(await as(U1, rec('t7', P1, 'transactions', tx('cash', 10, 'expense', { paymentMethod: 'm1' })))));
await as(U2, rec('mx', P2, 'paymentMethods', { name: 'UPI', country: 'India', enabled: true, custom: false }));
e = await as(U1, rec('t8', P1, 'transactions', tx('cash', 10, 'expense', { paymentMethod: 'mx' })));
ok('a transaction cannot use another profile’s method', /payment method/.test(e || ''), e);
ok('an import may insert a transaction before its method', !(await as(U1, `${rec('t9', P1, 'transactions', tx('cash', 10, 'expense', { paymentMethod: 'm9' }))}; ${rec('m9', P1, 'paymentMethods', { name: 'Card', country: 'India', enabled: true, custom: true })}`)));

console.log('\nShared group members and debt parties');
const grp = (names, expenses = []) => ({ name: 'Trip', amount: expenses.reduce((s, x) => s + x.amount, 0), paid: 0, memberNames: names, members: names.length, self: 'Sarath', party: names.join(', '), expenses });
ok('a group with the signed-in member is created', !(await as(U1, rec('sg', P1, 'shared', grp(['Sarath', 'Arjun', 'Meera'])))));
ok('an account expense is linked with all three in the split', !(await as(U1, rec('st', P1, 'transactions', tx('bank', 900, 'expense', { sharedGroupId: 'sg', paidBy: 'Sarath', participants: ['Sarath', 'Arjun', 'Meera'] })))));
const linked = async () => (await db.query(`select data from public.records where id='sg'`)).rows[0].data.expenses;
ok('the expense is mirrored into the group', (await linked()).length === 1 && (await linked())[0].transactionId === 'st');
const entryFor = parts => ({ id: 'tx-st', transactionId: 'st', name: 'T', amount: 900, date: '2026-10-20', paidBy: 'Sarath', participants: parts });
e = await as(U1, upd('sg', grp(['Sarath', 'Arjun'], [entryFor(['Sarath', 'Arjun'])])));
ok('removing a member from the group alone is rejected while a linked split uses them', !!e, e);
ok('step 1: the linked transaction drops the member (still valid for the old group)', !(await as(U1, upd('st', tx('bank', 900, 'expense', { sharedGroupId: 'sg', paidBy: 'Sarath', participants: ['Sarath', 'Arjun'] })))));
ok('step 2: the group saves without the member', !(await as(U1, upd('sg', grp(['Sarath', 'Arjun'], [entryFor(['Sarath', 'Arjun'])])))));
ok('the group and its linked transaction agree', JSON.stringify((await linked())[0].participants) === '["Sarath","Arjun"]');
ok('members become debt parties with group links', !(await as(U1, `${rec('pa', P1, 'parties', { name: 'Arjun', sharedGroupIds: ['sg'], autoCreated: true })}`)));
e = await as(U1, rec('pa2', P1, 'parties', { name: 'arjun', sharedGroupIds: ['sg'], autoCreated: true }));
ok('a member is never added twice as a party', /already exists/.test(e || ''), e);

console.log('\nSync clock (history) for offline changes');
const q1 = async (user, sql) => { await db.exec('begin'); await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${user}'`); const r = await db.query(sql); await db.exec('rollback'); return r.rows; };
ok('a budget is created', !(await as(U1, rec('bud', P1, 'budgets', { name: 'Food', category: 'Food', amount: 100 }))));
const base = (await q1(U1, `select max(created) as v from public.history where profile='${P1}'`))[0].v;
ok('the device sees a version', !!base);
ok('another device edits the budget', !(await as(U1, upd('bud', { name: 'Food', category: 'Food', amount: 250 }))));
const later = await q1(U1, `select created from public.history where profile='${P1}' and record='bud' and created > '${new Date(base).toISOString()}'`);
ok('an edit made after the device version is detected (conflict check)', later.length === 1);
ok('the budget is deleted', !(await as(U1, `delete from public.records where id='bud'`)));
const since = await q1(U1, `select distinct record, kind from public.history where profile='${P1}' and created > '${new Date(base).toISOString()}'`);
const still = await q1(U1, `select id from public.records where id='bud'`);
ok('change-only download lists the record, and it is gone (a tombstone)', since.some(h => h.record === 'bud' && h.kind === 'budgets') && still.length === 0);
ok('another user cannot read this profile’s sync clock', (await q1(U2, `select count(*)::int n from public.history where profile='${P1}'`))[0].n === 0);

console.log('\nRow level security');
const count = async (user, sql) => { await db.exec('begin'); await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${user}'`); const r = await db.query(sql); await db.exec('rollback'); return r.rows[0].n; };
ok('user 2 sees none of user 1’s records', (await count(U2, `select count(*)::int n from public.records where profile='${P1}'`)) === 0);
ok('user 2 sees none of user 1’s history', (await count(U2, `select count(*)::int n from public.history where profile='${P1}'`)) === 0);
ok('user 1 sees own history (audit trigger works)', (await count(U1, `select count(*)::int n from public.history where profile='${P1}'`)) > 0);
e = await as(U2, rec('evil', P1, 'transactions', tx('cash', 1)));
ok('user 2 cannot insert into user 1’s profile', !!e, e);
await as(U2, `update public.records set data=data||'{"amount":1}' where id='t1'`);
ok('user 2 cannot modify user 1’s records', (await count(U1, `select (data->>'amount')::int n from public.records where id='t1'`)) === 1900);
await as(U2, `delete from public.records where id='t1'`);
ok('user 2 cannot delete user 1’s records', (await count(U1, `select count(*)::int n from public.records where id='t1'`)) === 1);
e = await as(U2, `insert into public.history(profile,record,kind,action) values ('${P1}','x','x','x')`);
ok('nobody can write history directly', !!e, e);
e = await as(U1, `update public.records set kind='budgets' where id='cash'`);
ok('a record cannot change type (identity guard)', !!e, e);
e = await as(U1, `delete from public.records where id='cash'`);
ok('an account with history cannot be deleted', !!e, e);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
