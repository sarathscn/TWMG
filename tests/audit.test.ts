import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {ServiceError,databaseFailure,fetchAll,isAuthOutage} from '../lib/api-errors.ts';
import {ApiError,financeRequest} from '../lib/api-client.ts';
import {translateMessage} from '../lib/localization.ts';
test('Database errors: rule messages reach the reader, internals and outages do not',()=>{
 assert.equal(databaseFailure({code:'23514',message:"This would take Cash below zero. Cash and wallet balances can't be negative."}).message.startsWith('This would take'),true);
 assert.equal(databaseFailure({code:'P0001',message:'A record cannot change type.'}).message,'A record cannot change type.');
 for(const message of ['new row for relation "records" violates check constraint "x"','duplicate key value violates unique constraint "records_pkey"']){const e=databaseFailure({code:'23505',message});assert.ok(!(e instanceof ServiceError));assert.ok(!/records|constraint/.test(e.message),e.message);}
 const denied=databaseFailure({code:'42501',message:'new row violates row-level security policy for table "records"'});assert.ok(!/records|policy/.test(denied.message));assert.ok(!(denied instanceof ServiceError));
 for(const error of [{message:'fetch failed'},{code:'PGRST301',message:'JWT secret'},{code:'57014',message:'canceling statement due to statement timeout'}]){const e=databaseFailure(error);assert.ok(e instanceof ServiceError,error.message);assert.equal((e as ServiceError).status,503);assert.ok(!e.message.includes(error.message));}
});
test('An auth outage is not the same as being signed out',()=>{
 assert.equal(isAuthOutage({name:'AuthRetryableFetchError',status:0}),true);
 assert.equal(isAuthOutage({name:'AuthApiError',status:503}),true);
 assert.equal(isAuthOutage({name:'AuthSessionMissingError',status:400}),false);
 assert.equal(isAuthOutage({name:'AuthApiError',status:401}),false);
 assert.equal(isAuthOutage({name:'AuthApiError',status:403}),false);
 assert.equal(isAuthOutage(null),false);
});
test('Every row is read past the server limit of one response',async()=>{
 const all=Array.from({length:2500},(_,i)=>i),asked:number[][]=[];
 const page=async(from:number,to:number)=>{asked.push([from,to]);return{data:all.slice(from,to+1),error:null}};
 assert.deepEqual(await fetchAll(page),all);assert.deepEqual(asked,[[0,999],[1000,1999],[2000,2999]]);
 asked.length=0;const exact=Array.from({length:1000},(_,i)=>i);assert.equal((await fetchAll(async(from,to)=>{asked.push([from,to]);return{data:exact.slice(from,to+1),error:null}})).length,1000);assert.equal(asked.length,2,'a full last page checks once more');
 assert.deepEqual(await fetchAll(async()=>({data:[],error:null})),[]);
 await assert.rejects(fetchAll(async from=>from?{data:null,error:{message:'down'}}:{data:exact,error:null}),ServiceError,'a failed later page never returns partial data');
});
test('Requests that never reach the server end in a clear message',async()=>{
 const real=globalThis.fetch;
 try{
  globalThis.fetch=(async()=>{throw new TypeError('Failed to fetch')}) as typeof fetch;
  await assert.rejects(financeRequest('/x'),(e:ApiError)=>e.status===0&&/Can't reach the server/.test(e.message));
  globalThis.fetch=(async()=>{throw new DOMException('timed out','TimeoutError')}) as typeof fetch;
  await assert.rejects(financeRequest('/x'),(e:ApiError)=>e.status===0&&/too long/.test(e.message));
  let signal:AbortSignal|null|undefined;globalThis.fetch=(async(_:unknown,init:RequestInit)=>{signal=init.signal;return new Response('{"ok":true}')}) as typeof fetch;
  await financeRequest('/x');assert.ok(signal instanceof AbortSignal,'every request has a time limit');
 }finally{globalThis.fetch=real}
});
test('Routes use the outage and paging rules; render failures have a screen',()=>{
 const finance=readFileSync('app/api/finance/route.ts','utf8'),reminders=readFileSync('app/api/reminders/route.ts','utf8');
 assert.match(finance,/if\(isAuthOutage\(error\)\)throw new ServiceError\(\)/);assert.match(reminders,/if\(isAuthOutage\(error\)\)throw new ServiceError\(\)/);
 assert.match(finance,/\.select\('id,kind,data'\)\.eq\('profile',id\)\.order\('id'\)\.range\(from,to\)/);
 assert.match(reminders,/\.order\('id'\)\.range\(from,to\)/);
 assert.ok(existsSync('app/error.tsx'));assert.ok(existsSync('app/global-error.tsx'));
 const sw=readFileSync('public/sw.js','utf8');assert.match(sw,/res\.status >= 500/);assert.match(sw,/MAX_ASSETS/);
 assert.match(readFileSync('app/layout.tsx','utf8'),/appearanceBoot/);
});
test('The app tells the startup screen when it is ready, without needing the native method',()=>{
 const ui=readFileSync('app/ui/FinanceApp.tsx','utf8');
 assert.match(ui,/callNative\('startupReady', signedOut \? 'signed-out' : error \? 'error' : 'ready'\)/);
 assert.match(readFileSync('app/ui/DeviceSecurity.tsx','utf8'),/typeof fn !== 'function'|typeof .* === 'function'|\?\.\[name\]|!fn/);
});
test('Long lists draw in steps, and printed reports get every row',()=>{
 const ui=readFileSync('app/ui/FinanceApp.tsx','utf8');
 assert.ok(ui.includes('rows.slice(0, rowLimit).map('));
 assert.ok(ui.includes('flushSync(() => setRowLimit(Infinity)); window.print()'));
 assert.ok(ui.includes('setRowLimit(ROW_STEP); }, [view, ledger, filter, search, filters, dateFrom, dateTo]'));
});
test('Server failure messages have real translations, not the "check the fields" fallback',()=>{
 for(const message of [new ServiceError().message,databaseFailure({code:'23505',message:'violates x'}).message,databaseFailure({code:'42501',message:'x'}).message,"Can't reach the server. Check your connection and retry.",'The server took too long to respond. Please retry.','The request could not be processed.','TWMG is temporarily unavailable. Please try again shortly.'])
  for(const locale of ['hi','ar','ml','de']){const out=translateMessage(locale,message);assert.notEqual(out,message,locale+': '+message);assert.notEqual(out,translateMessage(locale,'Check the highlighted fields and try again.'),locale+': '+message);}
});
