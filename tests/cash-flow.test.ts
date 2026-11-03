import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {flowPoints,focusDate,localDate,periodRange,rangeLabel} from '../lib/cash-flow.ts';
import {totals} from '../lib/finance.ts';
import {accountSchema,appearance} from '../lib/record-schemas.ts';
import {categorySchema,paymentMethodSchema} from '../lib/preferences.ts';
import {profileDetailsSchema} from '../lib/profile.ts';
const tx=(date:string,type:'income'|'expense'|'transfer',amount:number,extra={})=>({id:date+type+amount,name:'x',type,amount,account:'a',date,category:'Other',...extra}) as any;
test('Day and Week follow the picked day or today, never a fixed date',()=>{
 assert.deepEqual(periodRange('Day','2026-11','2026-11-03'),{start:'2026-11-03',end:'2026-11-03'});
 assert.deepEqual(periodRange('Week','2026-11','2026-11-03'),{start:'2026-10-28',end:'2026-11-03'},'crosses into the previous month');
 assert.deepEqual(periodRange('Day','2026-11','2026-11-03','2026-11-17'),{start:'2026-11-17',end:'2026-11-17'});
 assert.deepEqual(periodRange('Week','2026-11','2026-11-03','2026-11-17'),{start:'2026-11-11',end:'2026-11-17'});
 assert.equal(focusDate('2026-02','2026-11-03'),'2026-02-28','a past month ends on its last day');
 assert.equal(focusDate('2024-02','2026-11-03'),'2024-02-29','leap year');
 assert.equal(focusDate('2026-11','2026-11-03','2026-10-05'),'2026-11-03','a day picked in another month is ignored');
});
test('Month and Year cover the whole calendar period',()=>{
 assert.deepEqual(periodRange('Month','2026-02','2026-11-03'),{start:'2026-02-01',end:'2026-02-28'});
 assert.deepEqual(periodRange('Month','2026-12','2026-11-03'),{start:'2026-12-01',end:'2026-12-31'});
 assert.deepEqual(periodRange('Year','2026-02','2026-11-03'),{start:'2026-01-01',end:'2026-12-31'});
});
test('Each view has the right points and labels',()=>{
 const points=(p:string,m='2026-11')=>{const r=periodRange(p,m,'2026-11-03');return flowPoints([],r.start,r.end,'en-GB')};
 assert.equal(points('Day').length,1);assert.equal(points('Day')[0].name,'3 Nov');
 assert.equal(points('Week').length,7);assert.equal(points('Week')[0].name,'Wed 28');assert.equal(points('Week')[6].name,'Tue 3');
 assert.equal(points('Month').length,30);assert.equal(points('Month','2024-02').length,29);assert.equal(points('Month')[29].name,'30');
 assert.deepEqual(points('Year').map(x=>x.name),['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']);
 assert.equal(points('Year')[0].label,'January 2026');assert.equal(points('Week')[0].label,'Wed, 28 Oct 2026');
 assert.equal(rangeLabel('2026-11-03','2026-11-03','en-GB'),'3 Nov 2026');
 assert.match(rangeLabel('2026-10-28','2026-11-03','en-GB'),/^28 Oct\s.\s3 Nov 2026$/);
});
test('Point totals add up to the period total, including its first and last day',()=>{
 const rows=[tx('2026-10-31','income',999),tx('2026-11-01','income',100),tx('2026-11-15','expense',40),tx('2026-11-15','expense',2),tx('2026-11-30','expense',8),tx('2026-12-01','expense',999),tx('2026-11-10','transfer',500),tx('2026-11-11','income',70,{partyId:'p'})];
 const inMonth=rows.filter(x=>x.date>='2026-11-01'&&x.date<='2026-11-30');
 for(const given of [rows,inMonth]){
  const p=flowPoints(given,'2026-11-01','2026-11-30','en-GB'),sum=(k:'income'|'expense')=>p.reduce((n,x)=>n+x[k],0),all=totals(inMonth);
  assert.equal(sum('income'),all.income);assert.equal(sum('expense'),all.expense);
  assert.equal(p[0].income,100,'first day');assert.equal(p[29].expense,8,'last day');assert.equal(p[14].expense,42,'same day adds');assert.equal(p[9].expense+p[9].income,0,'transfers are not income or spending');assert.equal(p[10].income,0,'debt payments stay out');
 }
 const year=flowPoints(rows,'2026-01-01','2026-12-31','en-GB');
 assert.equal(year[9].income,999);assert.equal(year[10].expense,50);assert.equal(year[11].expense,999);assert.equal(year[0].income,0,'empty month is zero');
 assert.equal(flowPoints(rows,'2026-11-01','2026-11-30','en-GB',100)[0].income,1,'minor units scale to display units');
});
test('An empty period and a From/To range both draw correctly',()=>{
 assert.ok(flowPoints([],'2026-11-01','2026-11-30','en-GB').every(x=>x.income===0&&x.expense===0));
 assert.deepEqual(flowPoints([],'2026-11-05','2026-11-01','en-GB'),[],'From after To');
 assert.equal(flowPoints([],'2026-11-05','2026-11-09','en-GB').length,5);
 const long=flowPoints([tx('2027-01-31','income',5)],'2026-10-15','2027-02-02','en-GB');
 assert.deepEqual(long.map(x=>x.name),['Oct 26','Nov 26','Dec 26','Jan 27','Feb 27']);assert.equal(long[3].income,5);
 assert.equal(flowPoints([tx('2026-10-01','income',5),tx('2026-10-20','income',7)],'2026-10-15','2027-02-02','en-GB')[0].income,7,'a month point stays inside the range');
});
test('Dates do not move in far time zones',()=>{
 const old=process.env.TZ;
 try{for(const zone of ['Pacific/Kiritimati','Pacific/Auckland','Pacific/Pago_Pago','Asia/Kolkata']){process.env.TZ=zone;assert.deepEqual(periodRange('Week','2026-11','2026-11-03'),{start:'2026-10-28',end:'2026-11-03'},zone);assert.equal(flowPoints([],'2026-11-03','2026-11-03','en-GB')[0].name,'3 Nov',zone)}
 assert.equal(localDate(new Date(Date.UTC(2026,10,3,12))).length,10)}finally{process.env.TZ=old}
});
test('The dashboard uses this logic, and tabs leave a picked day',()=>{
 const ui=readFileSync('app/ui/FinanceApp.tsx','utf8');
 assert.ok(!/-20T12|month \+ '-20'/.test(ui),'no fixed day of the month');
 assert.match(ui,/flowPoints\(tx, range\.start, range\.end/);
 assert.match(ui,/setPeriod\(x\); setDateFrom\(''\); setDateTo\(''\);/);
 assert.match(ui,/useState\(localDate\(\)\.slice\(0, 7\)\)/,'the current month is local, not UTC');
});
test('Clearing a colour or icon saves, and a bad colour does not',()=>{
 assert.equal(appearance.color.parse(undefined),undefined);assert.equal(appearance.emoji.parse(undefined),undefined);
 assert.equal(appearance.color.parse('#ABCDEF'),'#abcdef','custom colours save');
 assert.throws(()=>appearance.color.parse('red'));
 assert.throws(()=>appearance.color.parse(''),'an empty colour must be sent as undefined');
 assert.equal(paymentMethodSchema.parse({id:'m',name:'UPI',country:'India'}).color,undefined);
 assert.equal(categorySchema.parse({id:'c',name:'Food',color:'#123456',emoji:'🍕'}).emoji,'🍕');
 assert.equal(profileDetailsSchema.parse({name:'P',country:'India',emoji:'',color:'#2d6048'}).emoji,'','a profile can clear its icon');
 assert.throws(()=>appearance.emoji.parse('not-an-icon'));
 const fin=readFileSync('app/ui/FinanceApp.tsx','utf8'),shared=readFileSync('app/ui/SharedGroups.tsx','utf8');
 assert.match(fin,/const look = \{ color: color \|\| undefined, emoji: emoji \|\| undefined \}/);
 assert.match(shared,/color: color \|\| undefined, emoji: emoji \|\| undefined/);
 assert.ok(accountSchema);
});
test('The profile switcher only switches and adds; customizing lives in Settings',()=>{
 const profiles=readFileSync('app/ui/Profiles.tsx','utf8'),fin=readFileSync('app/ui/FinanceApp.tsx','utf8');
 const switcher=profiles.slice(profiles.indexOf('export function ProfileSwitcher'),profiles.indexOf('export function ProfileEditor'));
 assert.ok(!/Customize|onEdit|profile-customize/.test(switcher));
 assert.match(switcher,/onChoose\(p\.id\)/);assert.match(switcher,/Add a profile/);
 assert.match(fin,/profile-customize"[^>]*onClick=\{\(\) => setModal\(\{ kind: 'profile-edit', value: x \}\)\}/,'still on the Profiles page');
});
test('Panels never touch, and a lone or short panel leaves no void',()=>{
 const css=readFileSync('app/globals.css','utf8');
 assert.match(css,/main>\.panel\+\.panel\{margin-top:22px\}/);
 assert.match(css,/\.settings-grid>:only-child\{grid-column:1\/-1\}/);
 assert.match(css,/\.settings-grid \.account-settings\{grid-column:2;grid-row:1\/span 4\}/);
 assert.match(css,/\.account-card>p:last-child\{margin-top:auto/);
});
