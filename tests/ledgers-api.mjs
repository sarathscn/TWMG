import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServerClient} from '@supabase/ssr';
const user=JSON.parse(await fs.readFile('.vercel/ledger-user.json','utf8'));
const env=Object.fromEntries((await fs.readFile('.env.local','utf8')).trim().split(/\r?\n/).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));
const cookies=new Map();const supabase=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>cookies.set(x.name,x.value))}});
const signed=await supabase.auth.signInWithPassword({email:user.email,password:user.password});assert.ifError(signed.error);
const base='http://127.0.0.1:3000';
async function call(path,body,expected=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+encodeURIComponent(v)).join('; ')},body:body?JSON.stringify(body):undefined});for(const entry of r.headers.getSetCookie()){const part=entry.split(';')[0],i=part.indexOf('=');cookies.set(part.slice(0,i),decodeURIComponent(part.slice(i+1)))}const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw Error('Non-JSON response '+r.status+' '+path)}assert.equal(r.status,expected,JSON.stringify(data));return data;}

const initial=await call('/api/finance'),profile=initial.profile;
async function save(kind,value,expected=200){return call('/api/finance',{profile,kind,value},expected)}
async function remove(kind,id,expected=200){return call('/api/finance',{profile,kind,id,action:'delete'},expected)}
async function load(){return (await call('/api/finance?profile='+profile)).data}
const account={id:crypto.randomUUID(),name:'Ledger bank',type:'Bank account',currency:'INR',country:'India',opening:100000};
const other={...account,id:crypto.randomUUID(),name:'Savings'};
const party={id:crypto.randomUUID(),name:'Arjun',notes:'Roommate'};
const group={id:crypto.randomUUID(),name:'Apartment',amount:0,paid:0,memberNames:['Me','Arjun'],members:2,expenses:[]};
const bill={id:crypto.randomUUID(),name:'Internet',amount:99900,type:'Monthly',category:'Home & utilities'};
await save('accounts',account);await save('accounts',other);await save('parties',party);await save('shared',group);await save('recurring',bill);
const tx={id:crypto.randomUUID(),name:'Money lent',type:'expense',amount:10000,account:account.id,date:'2026-10-21',category:'Other',partyId:party.id,debtAction:'lend'};
await save('transactions',tx);await save('transactions',{...tx,id:crypto.randomUUID(),name:'Repayment received',amount:2500,type:'income',debtAction:'collect'});
await save('transactions',{...tx,id:crypto.randomUUID(),partyId:'foreign'},400);
await save('transactions',{...tx,id:crypto.randomUUID(),type:'income'},400);
await remove('parties',party.id,400);
const shared={id:crypto.randomUUID(),name:'Groceries',type:'expense',amount:10001,account:account.id,date:'2026-10-21',category:'Food & dining',sharedGroupId:group.id,paidBy:'Me',participants:['Me','Arjun']};
await save('transactions',shared);let d=await load();let g=d.shared.find(g=>g.id===group.id);assert.equal(g.amount,10001);assert.equal(g.expenses.length,1);assert.equal(g.expenses[0].transactionId,shared.id);
await save('transactions',{...shared,amount:12001});d=await load();g=d.shared.find(g=>g.id===group.id);assert.equal(g.amount,12001);assert.equal(g.expenses.length,1);
await save('shared',{...g,name:'Apartment renamed'});await save('shared',{...g,expenses:[],amount:0},400);
await save('transactions',{...shared,participants:['Outsider']},400);await remove('shared',group.id,400);
await save('transactions',{...shared,sharedGroupId:undefined,recurringId:bill.id,name:'Internet payment',amount:99900});d=await load();assert.equal(d.shared.find(g=>g.id===group.id).amount,0);assert.equal(d.transactions.find(t=>t.id===shared.id).recurringId,bill.id);
await remove('recurring',bill.id,400);
const transfer={id:crypto.randomUUID(),name:'Move money',type:'transfer',amount:1000,account:account.id,to:other.id,date:'2026-10-21',category:'Other'};await save('transactions',transfer);
// Roundtrip a backup containing every link; group rows are inserted before account transactions.
await save('transactions',{...shared,id:crypto.randomUUID()});d=await load();
const before=d.transactions.length;await call('/api/finance',{profile,action:'import',value:{data:d}});d=await load();assert.equal(d.transactions.length,before*2);assert.equal(d.parties.length,2);
const linked=d.transactions.filter(t=>t.sharedGroupId);assert.equal(linked.length,2);for(const t of linked){const group=d.shared.find(g=>g.id===t.sharedGroupId);assert.equal(group.expenses.filter(e=>e.transactionId===t.id).length,1)}
await remove('transactions',shared.id);await remove('transactions',transfer.id);
const direct=await supabase.from('records').update({data:{...tx,partyId:'foreign'}}).eq('id',tx.id).eq('profile',profile);assert.ok(direct.error,'Database must reject a forged link even outside the application API');
console.log('PASS: party ledgers, ownership validation, shared atomic insert/edit/relink, deletion guards, recurring history, transfer and backup links.');
