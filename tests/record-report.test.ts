import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecordReport,defaultPreset,fieldChoices,periodLabel,presetPeriod,reportFileName,withFields} from '../lib/record-report.ts';
import {pdfFromJpegs} from '../lib/report-pdf.ts';
import type {Data} from '../lib/finance.ts';
const f={money:(n:number,c='INR')=>`${c} ${(n/100).toFixed(2)}`,tr:(s:string,...a:any[])=>s.replace(/\{(\d)\}/g,(_,i)=>String(a[+i])),currency:'INR'};
const tx=(id:string,date:string,type:'income'|'expense'|'transfer',amount:number,extra:object={})=>({id,name:id,type,amount,account:'bank',category:'Food',date,...extra});
const data={accounts:[{id:'bank',name:'Bank',type:'Bank',currency:'INR',opening:100000},{id:'card',name:'Card',type:'Credit card',currency:'INR',opening:0,limit:500000,due:'2026-12-01'}],
 transactions:[tx('old','2026-09-10','expense',10000),tx('pay','2026-10-05','income',50000),tx('food','2026-10-06','expense',20000),tx('move','2026-10-07','transfer',30000,{to:'card'}),tx('lend','2026-10-08','expense',5000,{partyId:'p',debtAction:'lend'}),tx('back','2026-10-09','income',2000,{partyId:'p',debtAction:'collect'}),tx('bill','2026-10-10','expense',9900,{recurringId:'r',category:'Bills'}),tx('later','2026-11-02','expense',4000)],
 budgets:[{id:'b',name:'Food',amount:30000,category:'Food'}],goals:[],debts:[{id:'d',name:'Loan',party:'Asha',type:'Owed',amount:100000,paid:25000}],
 shared:[{id:'g',name:'Trip',amount:0,memberNames:['Me','Asha'],expenses:[{id:'e1',name:'Hotel',amount:6000,date:'2026-10-01',paidBy:'Me'},{id:'e2',name:'Taxi',amount:2000,date:'2026-11-01',paidBy:'Asha'}]}],
 recurring:[{id:'r',name:'Internet',amount:9900,due:'2026-12-10'}],parties:[{id:'p',name:'Ravi'}]} as unknown as Data;
const oct={from:'2026-10-01',to:'2026-10-31'},tile=(d:any,l:string)=>d.tiles.find((t:any)=>t.label===l)?.value;
const report=(kind:any,id:string,p=oct)=>buildRecordReport({kind,id},data,p,f,'2026-11-09')!;
test('An account report rolls the opening balance forward and counts both sides of a transfer',()=>{
 const d=report('accounts','bank');
 assert.equal(tile(d,'Opening balance'),'INR 900.00');assert.equal(tile(d,'Money in'),'INR 520.00');assert.equal(tile(d,'Money out'),'INR 649.00');assert.equal(tile(d,'Closing balance'),'INR 771.00');
 assert.equal(d.tables[0].rows.length,6);assert.ok(!d.tables[0].rows.some(r=>r.cells[1]==='later'||r.cells[1]==='old'));
 const c=report('accounts','card');assert.equal(c.subtitle,'Credit card report');assert.equal(tile(c,'Closing balance'),'INR 300.00');assert.equal(tile(c,'Credit limit'),'INR 5000.00');assert.equal(tile(c,'Payment due date'),'01/12/2026');
});
test('Debt, shared, recurring and budget reports only use their own records',()=>{
 const p=report('parties','p');assert.equal(tile(p,'Lent'),'INR 50.00');assert.equal(tile(p,'Collected'),'INR 20.00');assert.equal(tile(p,'Balance'),'INR 30.00 · to receive');assert.equal(p.tables[0].rows.length,2);
 const d=report('debts','d');assert.equal(tile(d,'Outstanding'),'INR 750.00');assert.equal(d.tables.length,0);
 const s=report('shared','g');assert.equal(tile(s,'Expenses'),'INR 60.00');assert.equal(tile(s,'Group total'),'INR 80.00');assert.equal(s.tables[1].rows.length,1);assert.equal(s.tables[0].rows.length,2);
 const r=report('recurring','r');assert.equal(tile(r,'Payments'),'1');assert.equal(tile(r,'Total paid'),'INR 99.00');
 const b=report('budgets','b');assert.equal(tile(b,'Spent'),'INR 200.00');assert.equal(tile(b,'Remaining'),'INR 100.00');assert.equal(b.tables[0].rows.length,1);
});
test('A long budget period multiplies the monthly budget, and overspending says so',()=>{
 const b=report('budgets','b',{from:'2026-09-01',to:'2026-10-31'});assert.equal(tile(b,'Budget for 2 months'),'INR 600.00');assert.equal(tile(b,'Over budget')??tile(b,'Remaining'),'INR 300.00');
 const over=buildRecordReport({kind:'budgets',id:'b'},{...data,budgets:[{id:'b',name:'Food',amount:10000,category:'Food'}]} as Data,oct,f,'2026-11-09')!;assert.equal(tile(over,'Over budget'),'INR 100.00');
});
test('A missing record gives no report, and periods and file names are safe',()=>{
 assert.equal(buildRecordReport({kind:'accounts',id:'nope'},data,oct,f,'2026-11-09'),null);
 assert.deepEqual(presetPeriod('month','2026-11-09'),{from:'2026-11-01',to:'2026-11-09'});assert.deepEqual(presetPeriod('quarter','2026-02-15'),{from:'2025-12-01',to:'2026-02-15'});assert.deepEqual(presetPeriod('all','2026-11-09'),{from:'',to:''});
 assert.equal(defaultPreset('accounts'),'month');assert.equal(defaultPreset('shared'),'all');assert.equal(periodLabel({from:'',to:''},f.tr),'All time');
 assert.equal(reportFileName({title:'Bank / Main'},oct),'TWMG-Bank-Main-2026-10-01-to-2026-10-31.pdf');assert.equal(reportFileName({title:'മലയാളം'},{from:'',to:''}),'TWMG-report-all-time.pdf');
});
test('The PDF writer produces a valid cross-reference table and one page per image',()=>{
 const jpeg=Uint8Array.from([255,216,1,2,3,255,217]),bytes=pdfFromJpegs([{jpeg,width:595,height:842,pxWidth:1190,pxHeight:1684},{jpeg,width:595,height:842,pxWidth:1190,pxHeight:1684}],'Trip മല');
 const s=Buffer.from(bytes).toString('latin1');
 assert.ok(s.startsWith('%PDF-1.4'));assert.ok(s.trimEnd().endsWith('%%EOF'));assert.match(s,/\/Count 2/);assert.match(s,/\/Title <FEFF0054/);
 const start=+s.match(/startxref\n(\d+)/)![1];assert.equal(s.slice(start,start+4),'xref');
 const size=+s.match(/\/Size (\d+)/)![1];assert.equal(size,10);
 const offsets=[...s.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map(m=>+m[1]);assert.equal(offsets.length,size-1);
 offsets.forEach((o,i)=>assert.equal(s.slice(o,o+`${i+1} 0 obj`.length),`${i+1} 0 obj`));
});
test('Reports offer only filled fields, and the choice decides the columns',()=>{
 const rich={...data,paymentMethods:[{id:'upi',name:'UPI',country:'India',enabled:true}],transactions:[tx('a','2026-10-05','expense',1000,{time:'09:30',notes:'Team lunch',tags:'work',paymentMethod:'upi'}),tx('b','2026-10-06','expense',2000)]} as unknown as Data;
 const d=buildRecordReport({kind:'accounts',id:'bank'},rich,oct,f,'2026-11-09')!,choices=fieldChoices(d)!;
 assert.deepEqual(choices.filled,['date','time','description','type','category','account','paymentMethod','notes','tags','amount']);assert.ok(!choices.filled.includes('party'));
 assert.deepEqual(d.tables[0].columns.map(c=>c.label),['Date','Description','Category','Amount']);
 const picked=withFields(d,['amount','paymentMethod','date','notes'],f.tr),t=picked.tables[0];
 assert.deepEqual(t.columns.map(c=>c.label),['Date','Payment method','Notes','Amount']);assert.deepEqual(t.rows[1].cells,['05/10/2026','UPI','Team lunch','-INR 10.00']);assert.equal(t.rows[0].cells[1],'');
 assert.ok(Math.abs(t.columns.reduce((s,c)=>s+c.width,0)-1)<1e-9);assert.ok(!picked.landscape);
 assert.equal(t.rows[0].tone,'out');assert.equal(withFields(d,['date','notes'],f.tr).tables[0].rows[0].tone,undefined);
 assert.ok(withFields(d,choices.filled,f.tr).landscape);
 assert.deepEqual(withFields(d,['party'],f.tr).tables[0].columns.map(c=>c.label),['Date','Description','Category','Amount'],'an unavailable field falls back to the default columns');
});
