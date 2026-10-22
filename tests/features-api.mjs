import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServerClient} from '@supabase/ssr';
const user=JSON.parse(await fs.readFile('.vercel/integration-user.json','utf8'));
const env=Object.fromEntries((await fs.readFile('.env.local','utf8')).trim().split(/\r?\n/).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));
const cookies=new Map();const supabase=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>cookies.set(x.name,x.value))}});
const signed=await supabase.auth.signInWithPassword({email:user.email,password:user.password});assert.ifError(signed.error);
const base='http://127.0.0.1:3000';
async function call(path,body,expected=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+encodeURIComponent(v)).join('; ')},body:body?JSON.stringify(body):undefined});for(const entry of r.headers.getSetCookie()){const part=entry.split(';')[0],i=part.indexOf('=');cookies.set(part.slice(0,i),decodeURIComponent(part.slice(i+1)))}const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw Error('Non-JSON response '+r.status+' '+path)}assert.equal(r.status,expected,JSON.stringify(data));return data;}
if(process.env.DELETE_TEST_ACCOUNT==='1'){
 await call('/api/account',{action:'delete_account',confirmation:'DELETE ACCOUNT',password:'incorrect'},401);
 await call('/api/account',{action:'delete_account',confirmation:'WRONG',password:user.password},400);
 await call('/api/account',{action:'delete_account',confirmation:'DELETE ACCOUNT',password:user.password});
 await call('/api/finance',null,401);console.log('PASS: password/confirmation rejection, permanent account deletion, sessions invalidated');process.exit(0);
}
let first=await call('/api/finance');assert.ok(first.data.categories.length>=10);const india=first.profile;
const create=await call('/api/finance',{action:'profile',value:{name:'Bahrain QA',country:'Bahrain'}}),profile=create.id;
let state=await call('/api/finance?profile='+profile);assert.equal(state.profiles.find(x=>x.id===profile).currency,'BHD');assert.ok(state.data.paymentMethods.some(x=>x.name==='BenefitPay'));assert.ok(!state.data.paymentMethods.some(x=>x.name.includes('PhonePe')));
const save=(kind,value,action)=>call('/api/finance',{profile,kind,value,action,id:value.id});
const account={id:crypto.randomUUID(),name:'BHD QA wallet',type:'Digital Wallet',country:'Bahrain',currency:'BHD',opening:1005};await save('accounts',account);
const category={id:crypto.randomUUID(),name:'Education QA',color:'#345c89'};await save('categories',category);await save('categories',{...category,name:'Learning QA'});state=await call('/api/finance?profile='+profile);assert.ok(state.data.categories.some(x=>x.name==='Learning QA'));
const method=state.data.paymentMethods.find(x=>x.name==='BenefitPay');const transaction={id:crypto.randomUUID(),name:'One fils',type:'expense',amount:1,account:account.id,category:'Learning QA',date:'2026-10-21',paymentMethod:method.id};await save('transactions',transaction);await save('paymentMethods',{...method,enabled:false});await call('/api/finance',{profile,kind:'transactions',value:{...transaction,id:crypto.randomUUID()}},400);await save('transactions',{...transaction,name:'Edited historical fils'});await save('paymentMethods',method,'delete');await save('transactions',{...transaction,name:'After method deletion'});await save('categories',category,'delete');state=await call('/api/finance?profile='+profile);assert.equal(state.data.transactions[0].amount,1);assert.equal(state.data.transactions[0].paymentMethodName,'BenefitPay');assert.equal(state.data.transactions[0].category,'Learning QA');
await call('/api/account',{action:'update',displayName:'QA account',username:'twmg_qa_'+user.id.slice(0,8),email:user.email,password:'incorrect'},400);
const username='twmg_qa_'+user.id.slice(0,8);await call('/api/account',{action:'update',displayName:'QA account',username,email:user.email,password:user.password});await call('/api/auth/login',{username,password:'incorrect'},401);await call('/api/auth/login',{username,password:user.password});state=await call('/api/finance');assert.equal(state.user.username,username);assert.equal(state.user.displayName,'QA account');
await call('/api/account',{action:'delete_profile',profile,confirmation:'DELETE PROFILE',password:'incorrect'},400);
await call('/api/account',{action:'delete_profile',profile,confirmation:'DELETE PROFILE',password:user.password});await call('/api/finance?profile='+profile,null,404);
await fs.writeFile('.vercel/integration-user.json',JSON.stringify({...user,username,profile:india}));
console.log('PASS: persisted category CRUD, Bahrain/BHD, Digital Wallet, country presets, disabled/deleted method history, username login, reauthentication, profile deletion/cascades');
