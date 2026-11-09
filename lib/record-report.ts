import {balance,categoryAmount,groupMembers,linkedTransactions,partyBalance,sharedEntries,sharedMemberBalances,sharedTotal,type Data,type Transaction} from './finance.ts';
import {displayDate} from './dates.ts';
// One report per record (account, card, party, debt, shared group, recurring bill, budget). The result is plain
// strings, already translated and formatted, so the on-screen preview and the PDF always show the same thing.
export type ReportKind='accounts'|'parties'|'debts'|'shared'|'recurring'|'budgets';
export type ReportTarget={kind:ReportKind;id:string};
export type ReportPeriod={from:string;to:string};
export type ReportRow={cells:string[];tone?:'in'|'out'};
export type ReportField='date'|'time'|'description'|'type'|'category'|'account'|'paymentMethod'|'party'|'group'|'bill'|'paidBy'|'participants'|'notes'|'tags'|'amount';
export type FieldRow={values:Partial<Record<ReportField,string>>;tone?:'in'|'out'};
export type ReportTable={title:string;columns:{label:string;width:number;end?:boolean}[];rows:ReportRow[];empty?:string;fieldRows?:FieldRow[];filled?:ReportField[];defaults?:ReportField[]};
export type ReportDoc={title:string;subtitle:string;period:string;tiles:{label:string;value:string}[];tables:ReportTable[];note?:string;landscape?:boolean};
export type ReportFormat={money:(n:number,c?:string)=>string;tr:(s:string,...a:any[])=>string;currency:string};
export type ReportPreset='month'|'quarter'|'year'|'all';
export function presetPeriod(preset:ReportPreset,today:string):ReportPeriod{
 if(preset==='all')return {from:'',to:''};
 const y=+today.slice(0,4),m=+today.slice(5,7);
 if(preset==='year')return {from:`${y}-01-01`,to:today};
 const start=new Date(Date.UTC(y,m-(preset==='quarter'?3:1),1)).toISOString().slice(0,10);
 return {from:start,to:today};
}
export const defaultPreset=(kind:ReportKind):ReportPreset=>kind==='accounts'||kind==='budgets'?'month':'all';
export function periodLabel(p:ReportPeriod,tr:ReportFormat['tr']){return p.from&&p.to?`${displayDate(p.from)} — ${displayDate(p.to)}`:p.from?`${tr('From')} ${displayDate(p.from)}`:p.to?`${tr('To')} ${displayDate(p.to)}`:tr('All time')}
const within=(date:string,p:ReportPeriod)=>(!p.from||date>=p.from)&&(!p.to||date<=p.to);
const sumBy=<T,>(list:T[],key:(x:T)=>string,value:(x:T)=>number)=>{const out=new Map<string,number>();for(const x of list)out.set(key(x),(out.get(key(x))||0)+value(x));return out};
const moneyList=(totals:Map<string,number>,f:ReportFormat)=>totals.size?[...totals].map(([c,v])=>f.money(v,c)).join(' + '):f.money(0,f.currency);
const signed=(n:number,c:string,f:ReportFormat)=>(n<0?'-':n>0?'+':'')+f.money(Math.abs(n),c);
// The columns someone can choose, in the order they print. Only fields filled in on at least one row are offered.
const fieldInfo:[ReportField,string,number,boolean?][]=[['date','Date',14],['time','Time',10],['description','Description',28],['type','Type',10],['category','Category',16],['account','Account',16],['paymentMethod','Payment method',19],['party','Party',12],['group','Shared group',14],['bill','Recurring bill',14],['paidBy','Paid by',12],['participants','Participants',18],['notes','Notes',22],['tags','Tags',12],['amount','Amount',16,true]];
export const fieldLabel=(key:ReportField,tr:ReportFormat['tr'])=>tr(fieldInfo.find(x=>x[0]===key)![1]);
function layoutFields(t:ReportTable,chosen:ReportField[],tr:ReportFormat['tr']):ReportTable{
 const rows=t.fieldRows||[],filled=t.filled||[],picked=fieldInfo.filter(x=>chosen.includes(x[0])&&filled.includes(x[0]));
 const use=picked.length?picked:fieldInfo.filter(x=>(t.defaults||[]).includes(x[0])),total=use.reduce((s,x)=>s+x[2],0),hasAmount=use.some(x=>x[0]==='amount');
 return {...t,columns:use.map(x=>({label:tr(x[1]),width:x[2]/total,end:x[3]})),rows:rows.map(r=>({cells:use.map(x=>r.values[x[0]]||''),tone:hasAmount?r.tone:undefined}))};
}
export function fieldTable(title:string,fieldRows:FieldRow[],defaults:ReportField[],f:ReportFormat,empty?:string):ReportTable{
 const filled=fieldInfo.map(x=>x[0]).filter(k=>fieldRows.some(r=>r.values[k]));
 return layoutFields({title,columns:[],rows:[],empty,fieldRows,filled,defaults},defaults,f.tr);
}
// Applies the person's choice. Wide selections print sideways so the columns stay readable.
export function withFields(doc:ReportDoc,chosen:ReportField[]|null,tr:ReportFormat['tr']):ReportDoc{
 const tables=doc.tables.map(t=>t.fieldRows&&chosen?layoutFields(t,chosen,tr):t);
 return {...doc,tables,landscape:tables.some(t=>t.columns.length>6)};
}
export const fieldChoices=(doc:ReportDoc|null)=>{const t=doc?.tables.find(x=>x.fieldRows);return t?{filled:t.filled||[],defaults:t.defaults||[]}:null};
export function transactionRow(t:Transaction,data:Data,amount:number,currency:string,f:ReportFormat):FieldRow{
 const account=data.accounts.find(a=>a.id===t.account)?.name||'',to=t.to?data.accounts.find(a=>a.id===t.to)?.name||'':'';
 const method=t.paymentMethodName||data.paymentMethods?.find(m=>m.id===t.paymentMethod)?.name||'';
 return {values:{date:displayDate(t.date),time:t.time||'',description:t.name,type:f.tr(t.type==='income'?'Income':t.type==='expense'?'Expense':'Transfer'),category:t.type==='transfer'?f.tr('Transfer'):t.splits?.length?t.splits.map(s=>s.category).join(', '):t.category,account:to?`${account} → ${to}`:account,paymentMethod:method,party:data.parties?.find(p=>p.id===t.partyId)?.name||'',group:data.shared.find(g=>g.id===t.sharedGroupId)?.name||'',bill:data.recurring.find(r=>r.id===t.recurringId)?.name||'',paidBy:t.paidBy||'',participants:t.participants?.join(', ')||'',notes:t.notes||'',tags:t.tags||'',amount:signed(amount,currency,f)},tone:amount>0?'in':amount<0?'out':undefined};
}
const monthsIn=(from:string,to:string)=>Math.max(1,(+to.slice(0,4)-+from.slice(0,4))*12+(+to.slice(5,7)-+from.slice(5,7))+1);
export function buildRecordReport(target:ReportTarget,data:Data,period:ReportPeriod,f:ReportFormat,today:string):ReportDoc|null{
 const {tr,money,currency}=f,label=periodLabel(period,tr),empty=tr('Nothing recorded in this period.');
 const currencyOf=(t:Transaction)=>data.accounts.find(a=>a.id===t.account)?.currency||currency,txRow=(t:Transaction,amount:number,c:string)=>transactionRow(t,data,amount,c,f);
 if(target.kind==='accounts'){
  const a=data.accounts.find(x=>x.id===target.id);if(!a)return null;
  const all=linkedTransactions('accounts',a.id,data.transactions),rows=all.filter(t=>within(t.date,period));
  const effect=(t:Transaction)=>(t.account===a.id?(t.type==='income'?t.amount:-t.amount):0)+(t.type==='transfer'&&t.to===a.id?(t.received??t.amount):0);
  const opening=period.from?balance(a,all.filter(t=>t.date<period.from)):a.opening,closing=period.to?balance(a,all.filter(t=>t.date<=period.to)):balance(a,all);
  const tiles=[{label:tr('Opening balance'),value:money(opening,a.currency)},{label:tr('Money in'),value:money(rows.reduce((s,t)=>s+Math.max(0,effect(t)),0),a.currency)},{label:tr('Money out'),value:money(rows.reduce((s,t)=>s+Math.max(0,-effect(t)),0),a.currency)},{label:tr('Closing balance'),value:money(closing,a.currency)}];
  const card=a.type==='Credit card';
  if(card){tiles.push({label:tr('Credit limit'),value:money(a.limit||0,a.currency)},{label:tr('Available credit'),value:money((a.limit||0)+Math.min(0,closing),a.currency)});if(a.due)tiles.push({label:tr('Payment due date'),value:displayDate(a.due)})}
  return {title:a.name,subtitle:tr(card?'Credit card report':'Account report'),period:label,tiles,tables:[fieldTable(tr('Transactions'),rows.map(t=>txRow(t,effect(t),a.currency)),['date','description','category','amount'],f,empty)]};
 }
 if(target.kind==='parties'){
  const p=data.parties?.find(x=>x.id===target.id);if(!p)return null;
  const all=linkedTransactions('parties',p.id,data.transactions),rows=all.filter(t=>within(t.date,period)),codes=[...new Set(rows.map(currencyOf))];if(!codes.length)codes.push(currency);
  const total=(action:string)=>moneyList(sumBy(rows.filter(t=>t.debtAction===action),currencyOf,t=>t.amount),f);
  const owed=(period.to?all.filter(t=>t.date<=period.to):all);
  const standing=[...new Set(owed.map(currencyOf))].map(c=>{const net=partyBalance(p.id,owed.filter(t=>currencyOf(t)===c));return `${money(Math.abs(net),c)} · ${tr(net>0?'to receive':net<0?'to repay':'settled')}`}).join(' + ')||tr('settled');
  const effect=(t:Transaction)=>['lend','repay'].includes(t.debtAction||'')?-t.amount:t.amount;
  return {title:p.name,subtitle:tr('Debt report'),period:label,tiles:[{label:tr('Lent'),value:total('lend')},{label:tr('Borrowed'),value:total('borrow')},{label:tr('Collected'),value:total('collect')},{label:tr('Repaid'),value:total('repay')},{label:tr('Balance'),value:standing}],tables:[fieldTable(tr('Transactions'),rows.map(t=>txRow(t,effect(t),currencyOf(t))),['date','description','account','amount'],f,empty)]};
 }
 if(target.kind==='debts'){
  const d=data.debts.find(x=>x.id===target.id);if(!d)return null;
  const paid=d.paid||0,tiles=[{label:tr('Total'),value:money(d.amount)},{label:tr('Repaid'),value:money(paid)},{label:tr('Outstanding'),value:money(d.amount-paid)}];
  if(d.type)tiles.push({label:tr('Type'),value:tr(d.type)});if(d.due)tiles.push({label:tr('Due date'),value:displayDate(d.due)});
  return {title:d.party?`${d.party} · ${d.name}`:d.name,subtitle:tr('Debt report'),period:tr('All time'),tiles,tables:[],note:tr('Existing debt records keep a running balance only, so there are no individual transactions to list.')};
 }
 if(target.kind==='shared'){
  const g=data.shared.find(x=>x.id===target.id);if(!g)return null;
  const entries=sharedEntries(g),rows=entries.filter(e=>within(e.date,period)).sort((a,b)=>b.date.localeCompare(a.date)),all=sharedTotal(entries);
  return {title:g.name,subtitle:tr('Shared expense report'),period:label,tiles:[{label:tr('Expenses'),value:money(sharedTotal(rows))},{label:tr('Transactions'),value:String(rows.length)},{label:tr('Members'),value:String(groupMembers(g).length)},{label:tr('Group total'),value:money(all)},{label:tr('Outstanding'),value:money(Math.max(0,all-(g.paid||0)))}],tables:[{title:tr('Member balances'),columns:[{label:tr('Member'),width:.4},{label:tr('Paid'),width:.2,end:true},{label:tr('Share'),width:.2,end:true},{label:tr('Balance'),width:.2,end:true}],rows:sharedMemberBalances(g).map(m=>({cells:[m.name,money(m.paid),money(m.share),signed(m.net,currency,f)],tone:m.net>0?'in' as const:m.net<0?'out' as const:undefined}))},fieldTable(tr('Transactions'),rows.map(e=>({values:{date:displayDate(e.date),description:e.name,paidBy:e.paidBy,participants:e.participants?.join(', ')||'',notes:e.notes||'',amount:money(e.amount)}})),['date','description','paidBy','amount'],f,empty)]};
 }
 if(target.kind==='recurring'){
  const r=data.recurring.find(x=>x.id===target.id);if(!r)return null;
  const rows=linkedTransactions('recurring',r.id,data.transactions).filter(t=>within(t.date,period));
  const tiles=[{label:tr('Scheduled amount'),value:money(r.amount)},{label:tr('Payments'),value:String(rows.length)},{label:tr('Total paid'),value:moneyList(sumBy(rows,currencyOf,t=>t.amount),f)}];
  if(r.due)tiles.push({label:tr('Next due'),value:displayDate(r.due)});
  return {title:r.name,subtitle:tr('Recurring bill report'),period:label,tiles,tables:[fieldTable(tr('Payment history'),rows.map(t=>txRow(t,-t.amount,currencyOf(t))),['date','description','account','amount'],f,empty)]};
 }
 const b=data.budgets.find(x=>x.id===target.id);if(!b)return null;
 const category=b.category||b.name,matching=data.transactions.filter(t=>t.type==='expense'&&!t.partyId&&currencyOf(t)===currency&&categoryAmount(t,category)>0);
 const rows=matching.filter(t=>within(t.date,period)).sort((x,y)=>y.date.localeCompare(x.date));
 const first=period.from||matching.map(t=>t.date).sort()[0]||today,months=monthsIn(first,period.to||today),budget=b.amount*months,spent=rows.reduce((s,t)=>s+categoryAmount(t,category),0),left=budget-spent;
 return {title:b.name,subtitle:tr('Budget report'),period:label,tiles:[{label:tr(months>1?'Budget for {0} months':'Budget',months),value:money(budget)},{label:tr('Spent'),value:money(spent)},{label:tr(left<0?'Over budget':'Remaining'),value:money(Math.abs(left))}],tables:[fieldTable(tr('Transactions'),rows.map(t=>txRow(t,-categoryAmount(t,category),currency)),['date','description','account','amount'],f,empty)]};
}
export const reportFileName=(doc:{title:string},period:ReportPeriod)=>`TWMG-${doc.title.normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'report'}-${period.from&&period.to?`${period.from}-to-${period.to}`:'all-time'}.pdf`;
