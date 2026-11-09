import test from 'node:test';
import assert from 'node:assert/strict';
import {creditChangeError,creditPaid,creditSummary,creditTotals,type CreditRecord} from '../lib/credit.ts';
import {loanSchema,payLaterSchema} from '../lib/record-schemas.ts';
import {allowRequest} from '../lib/rate-limit.ts';
import {reminders} from '../lib/reminders.ts';
import {buildRecordReport} from '../lib/record-report.ts';
import type {Data} from '../lib/finance.ts';
const p=(id:string,amount:number,extra={})=>({id,date:'2026-02-01',amount,...extra});
const loan:CreditRecord={id:'l',name:'Car',amount:120000,party:'Bank',direction:'borrowed',start:'2026-01-15',due:'2027-01-15',frequency:'Monthly',installments:12,payments:[]};
test('The balance is always the amount less payments, and reversed payments do not count',()=>{
 const s=creditSummary({...loan,payments:[p('a',10000),p('b',5000),p('c',99999,{void:true})]},'2026-02-01','loans');
 assert.equal(s.paid,15000);assert.equal(s.outstanding,105000);assert.equal(s.remaining,11);assert.equal(s.status,'Active');
 assert.equal(creditPaid({...loan,payments:[p('c',5,{void:true})]}),0);
});
test('Status and next due follow the installments actually paid',()=>{
 assert.equal(creditSummary(loan,'2026-01-20','loans').nextDue,'2026-02-15');
 assert.equal(creditSummary(loan,'2026-03-01','loans').status,'Overdue');
 const oneDown={...loan,payments:[p('a',10000)]};assert.equal(creditSummary(oneDown,'2026-03-01','loans').nextDue,'2026-03-15');assert.equal(creditSummary(oneDown,'2026-03-01','loans').status,'Active');
 const done=creditSummary({...loan,payments:[p('a',120000)]},'2030-01-01','loans');assert.equal(done.status,'Paid');assert.equal(done.outstanding,0);assert.equal(done.nextDue,'');assert.equal(done.remaining,0);
 const later:CreditRecord={id:'x',name:'TV',provider:'Shop',amount:10001,due:'2026-03-01',frequency:'Monthly',installments:3,payments:[]};const s=creditSummary(later,'2026-02-01','payLater');
 assert.equal(s.status,'Pending');assert.equal(s.schedule.length,3);assert.equal(s.schedule.reduce((n,x)=>n+x.amount,0),10001,'the installments add up to the exact amount');assert.equal(s.schedule[2].date,'2026-05-01');
 assert.equal(creditSummary({...later,installments:undefined,frequency:'Once'},'2026-04-01','payLater').status,'Overdue');
});
test('Totals keep what you owe, what you lent and Pay Later apart',()=>{
 assert.deepEqual(creditTotals({loans:[loan,{...loan,id:'g',direction:'lent',amount:500}],payLater:[{id:'x',name:'TV',amount:700,payments:[p('a',200)]}]}),{owed:120000,lent:500,payLater:500});
});
test('A saved payment can only be added or reversed',()=>{
 const before={...loan,payments:[p('a',1000)]};
 assert.equal(creditChangeError(before,{...before,payments:[p('a',1000),p('b',1)]}),null);
 assert.equal(creditChangeError(before,{...before,payments:[p('a',1000,{void:true})]}),null);
 assert.match(creditChangeError(before,{...before,payments:[]})!,/removed/);assert.match(creditChangeError(before,{...before,payments:[p('a',999)]})!,/changed/);
 assert.match(creditChangeError({...before,payments:[p('a',1000,{void:true})]},before)!,/restored/);assert.match(creditChangeError(undefined,{...loan,amount:5,payments:[p('a',6)]})!,/more than/);
});
test('The server drops any balance a client sends and rejects bad records',()=>{
 const parsed=loanSchema.parse({...loan,outstanding:1,status:'Paid',paid:999}) as Record<string,unknown>;assert.ok(!('outstanding' in parsed)&&!('status' in parsed)&&!('paid' in parsed));
 assert.throws(()=>loanSchema.parse({...loan,payments:[p('a',999999)]}));assert.throws(()=>loanSchema.parse({...loan,payments:[p('a',1),p('a',1)]}));assert.throws(()=>loanSchema.parse({...loan,amount:10.5}));assert.throws(()=>loanSchema.parse({...loan,due:'2020-01-01'}));
 assert.ok(payLaterSchema.parse({id:'x',name:'TV',provider:'Shop',amount:5,due:'2026-01-01',frequency:'Once'}).payments.length===0);
});
test('Rate limits block after the limit and reset',()=>{
 for(let i=0;i<3;i++)assert.ok(allowRequest('t',3,1000,0));assert.equal(allowRequest('t',3,1000,1),false);assert.equal(allowRequest('other',3,1000,1),true);assert.ok(allowRequest('t',3,1000,2000));
});
const data={accounts:[{id:'bank',name:'Bank',type:'Bank',currency:'INR',opening:100000},{id:'card',name:'Card',type:'Credit card',currency:'INR',opening:0,limit:1000},{id:'usd',name:'US',type:'Bank',currency:'USD',opening:5}],transactions:[{id:'i',name:'Pay',type:'income',amount:50000,account:'bank',category:'Salary',date:'2026-10-05'},{id:'e',name:'Food',type:'expense',amount:2000,account:'bank',category:'Food',date:'2026-10-06'},{id:'n',name:'Nov',type:'expense',amount:1000,account:'bank',category:'Bills',date:'2026-11-06',recurringId:'r'},{id:'x',name:'Foreign',type:'expense',amount:1,account:'usd',category:'Food',date:'2026-10-06'},{id:'c',name:'Card spend',type:'expense',amount:300,account:'card',category:'Food',date:'2026-10-07'}],budgets:[],goals:[],debts:[],shared:[],recurring:[{id:'r',name:'Net',amount:1000}],parties:[],loans:[{...loan,payments:[p('a',20000)]}],payLater:[{id:'pl',name:'TV',provider:'Shop',amount:7000,due:'2026-12-01',frequency:'Once',payments:[]}]} as unknown as Data;
const f={money:(n:number,c='INR')=>c+' '+(n/100).toFixed(2),tr:(s:string,...a:any[])=>s.replace(/\{(\d)\}/g,(_,i)=>String(a[+i])),currency:'INR'},tile=(d:any,l:string)=>d.tiles.find((t:any)=>t.label===l)?.value,all={from:'',to:''},run=(id:string,p=all,cat='')=>buildRecordReport({kind:'summary',id},data,p,f,'2026-11-09',cat)!;
test('Statements show payments and the calculated balance',()=>{
 const d=buildRecordReport({kind:'loans',id:'l'},data,all,f,'2026-11-09')!;assert.equal(d.subtitle,'Loan statement');assert.equal(tile(d,'Outstanding balance'),'INR 1000.00');assert.equal(tile(d,'Total paid'),'INR 200.00');assert.equal(d.tables[0].rows.length,1);assert.equal(d.tables[1].rows.length,12);
 assert.equal(buildRecordReport({kind:'payLater',id:'pl'},data,all,f,'2026-11-09')!.subtitle,'Pay Later statement');
});
test('Summary reports add up, stay in one currency and honour period and category',()=>{
 const m=run('monthly');assert.deepEqual(m.tables[0].rows.map(r=>r.cells[0]),['11/2026','10/2026']);assert.equal(tile(m,'Income'),'INR 500.00');assert.equal(tile(m,'Expenses'),'INR 33.00','the foreign-currency expense is left out');
 assert.equal(tile(run('yearly',{from:'2026-11-01',to:'2026-11-30'}),'Expenses'),'INR 10.00');assert.equal(tile(run('income-expense',all,'Food'),'Expenses'),'INR 23.00');assert.equal(tile(run('income-expense',all,'Food'),'Income'),'INR 0.00');
 const pay=run('payments');assert.equal(tile(pay,'Total paid'),'INR 210.00');assert.equal(tile(pay,'Payments'),'2');
 const o=run('outstanding');assert.equal(tile(o,'You owe'),'INR 1073.00');assert.equal(tile(o,'Pay Later'),'INR 70.00');
 assert.equal(tile(run('financial'),'Net position'),'INR 397.00');
});
test('Upcoming loan and Pay Later payments create reminders, and paid ones stop',()=>{
 const r=reminders(data,'INR','2026-11-20');assert.ok(r.some(x=>x.id==='payLater:pl'&&x.view==='Pay Later'&&x.amount===7000));
 const paid={...data,payLater:[{id:'pl',name:'TV',amount:7000,due:'2026-12-01',frequency:'Once',payments:[p('a',7000)]}]} as unknown as Data;assert.ok(!reminders(paid,'INR','2026-11-20').some(x=>x.id==='payLater:pl'));
});
