import {balance,categoryAmount,partyBalance,sharedEntries,sharedTotal,type Data,type Transaction} from './finance.ts';
import {displayDate} from './dates.ts';
import {creditPaid,creditSummary,creditTotals,type CreditKind} from './credit.ts';
import {fieldTable,periodLabel,transactionRow,type FieldRow,type ReportDoc,type ReportFormat,type ReportPeriod} from './record-report.ts';
// Reports across a whole profile, in its main currency: accounts in other currencies are left out rather
// than converted, because the app holds no verified exchange rates.
export const summaryReports=[['monthly','Monthly report'],['yearly','Yearly report'],['income-expense','Income and expense report'],['payments','Payment summary'],['outstanding','Outstanding balances'],['financial','Financial summary']] as const;
export type SummaryId=typeof summaryReports[number][0];
export const summaryUsesCategory=(id:string)=>id==='monthly'||id==='yearly'||id==='income-expense';
const inPeriod=(date:string,p:ReportPeriod)=>(!p.from||date>=p.from)&&(!p.to||date<=p.to);
export function buildSummaryReport(id:string,data:Data,period:ReportPeriod,f:ReportFormat,today:string,category=''):ReportDoc|null{
 const {tr,money,currency}=f,title=summaryReports.find(x=>x[0]===id)?.[1];if(!title)return null;
 const label=periodLabel(period,tr),empty=tr('Nothing recorded in this period.'),subtitle=tr(category&&summaryUsesCategory(id)?'Category: {0}':'All categories',category);
 const home=new Set(data.accounts.filter(a=>a.currency===currency).map(a=>a.id)),scoped=data.transactions.filter(t=>home.has(t.account)&&inPeriod(t.date,period));
 const counted=scoped.filter(t=>!t.partyId&&(!category||categoryAmount(t,category)>0)),value=(t:Transaction)=>category?categoryAmount(t,category):t.amount;
 const income=counted.filter(t=>t.type==='income'),expense=counted.filter(t=>t.type==='expense'),sum=(l:Transaction[])=>l.reduce((s,t)=>s+value(t),0);
 const flowTiles=[{label:tr('Income'),value:money(sum(income))},{label:tr('Expenses'),value:money(sum(expense))},{label:tr('Net cash flow'),value:money(sum(income)-sum(expense))}];
 const newest=<T extends {date:string}>(l:T[])=>[...l].sort((a,b)=>b.date.localeCompare(a.date));
 if(id==='monthly'||id==='yearly'){
  const size=id==='monthly'?7:4,keys=[...new Set(counted.filter(t=>t.type!=='transfer').map(t=>t.date.slice(0,size)))].sort().reverse();
  const rows=keys.map(k=>{const inc=sum(income.filter(t=>t.date.startsWith(k))),exp=sum(expense.filter(t=>t.date.startsWith(k))),net=inc-exp;return {cells:[size===7?`${k.slice(5)}/${k.slice(0,4)}`:k,money(inc),money(exp),money(net)],tone:net>0?'in' as const:net<0?'out' as const:undefined}});
  return {title:tr(title),subtitle,period:label,tiles:flowTiles,tables:[{title:tr(id==='monthly'?'By month':'By year'),columns:[{label:tr('Period'),width:.28},{label:tr('Income'),width:.24,end:true},{label:tr('Expenses'),width:.24,end:true},{label:tr('Net cash flow'),width:.24,end:true}],rows,empty}]};
 }
 if(id==='income-expense'){
  const names=[...new Set(counted.filter(t=>t.type!=='transfer').flatMap(t=>t.splits?.length?t.splits.map(s=>s.category):[t.category]))].filter(n=>!category||n===category).sort();
  const totalOf=(l:Transaction[],n:string)=>l.reduce((s,t)=>s+categoryAmount(t,n),0);
  return {title:tr(title),subtitle,period:label,tiles:flowTiles,tables:[{title:tr('By category'),columns:[{label:tr('Category'),width:.5},{label:tr('Income'),width:.25,end:true},{label:tr('Expenses'),width:.25,end:true}],rows:names.map(n=>({cells:[n,money(totalOf(income,n)),money(totalOf(expense,n))]})),empty},fieldTable(tr('Transactions'),newest(counted.filter(t=>t.type!=='transfer')).map(t=>transactionRow(t,data,t.type==='income'?value(t):-value(t),currency,f)),['date','description','category','account','amount'],f,empty)]};
 }
 if(id==='payments'){
  const cards=new Set(data.accounts.filter(a=>a.type==='Credit card').map(a=>a.id)),out:(FieldRow&{date:string;total:number})[]=[];
  const add=(date:string,description:string,type:string,total:number)=>out.push({date,total,values:{date:displayDate(date),description,type:tr(type),amount:money(total)}});
  for(const t of scoped){if(t.recurringId)add(t.date,t.name,'Recurring bill',t.amount);else if(t.type==='transfer'&&t.to&&cards.has(t.to))add(t.date,t.name,'Credit card repayment',t.amount);else if(t.debtAction==='repay')add(t.date,t.name,'Debt repayment',t.amount)}
  for(const kind of ['loans','payLater'] as const)for(const r of data[kind]||[])for(const p of r.payments||[])if(!p.void&&inPeriod(p.date,period))add(p.date,r.name,kind==='loans'?'Loan payment':'Pay Later payment',p.amount);
  return {title:tr(title),subtitle:tr('Money you paid towards bills, cards, debts, loans and Pay Later'),period:label,tiles:[{label:tr('Total paid'),value:money(out.reduce((s,x)=>s+x.total,0))},{label:tr('Payments'),value:String(out.length)}],tables:[fieldTable(tr('Payments'),newest(out),['date','description','type','amount'],f,empty)]};
 }
 const credit=creditTotals(data),left=(kind:CreditKind)=>(data[kind]||[]).map(r=>({r,s:creditSummary(r,today,kind)})).filter(x=>x.s.outstanding>0);
 const accounts=data.accounts.filter(a=>a.currency===currency),cardsOwed=accounts.filter(a=>a.type==='Credit card').reduce((s,a)=>s+Math.max(0,-balance(a,data.transactions)),0);
 const partyNet=(data.parties||[]).map(p=>({p,net:partyBalance(p.id,data.transactions.filter(t=>home.has(t.account)))}));
 const debtSigned=(type?:string)=>type==='Borrowed'?-1:1,legacy=data.debts.filter(d=>d.amount-(d.paid||0)>0);
 if(id==='outstanding'){
  type Row={type:string;name:string;due:string;owe:number};
  const rows:Row[]=[...accounts.filter(a=>a.type==='Credit card'&&balance(a,data.transactions)<0).map(a=>({type:'Credit card',name:a.name,due:a.due||'',owe:-balance(a,data.transactions)})),...partyNet.filter(x=>x.net).map(x=>({type:'Debt',name:x.p.name,due:'',owe:-x.net})),...legacy.map(d=>({type:'Debt',name:d.party?`${d.party} · ${d.name}`:d.name,due:d.due||'',owe:debtSigned(d.type)*-1*(d.amount-(d.paid||0))})),...data.shared.map(g=>({g,n:sharedTotal(sharedEntries(g))-(g.paid||0)})).filter(x=>x.n>0).map(x=>({type:'Shared expense',name:x.g.name,due:x.g.due||'',owe:x.n})),...left('loans').map(x=>({type:'Loan',name:x.r.party?`${x.r.name} · ${x.r.party}`:x.r.name,due:x.s.nextDue,owe:x.r.direction==='lent'?-x.s.outstanding:x.s.outstanding})),...left('payLater').map(x=>({type:'Pay Later',name:x.r.provider?`${x.r.name} · ${x.r.provider}`:x.r.name,due:x.s.nextDue,owe:x.s.outstanding}))];
  const owe=rows.filter(r=>r.owe>0).reduce((s,r)=>s+r.owe,0),owed=rows.filter(r=>r.owe<0).reduce((s,r)=>s-r.owe,0);
  return {title:tr(title),subtitle:tr('As of today'),period:displayDate(today),tiles:[{label:tr('You owe'),value:money(owe)},{label:tr('Owed to you'),value:money(owed)},{label:tr('Pay Later'),value:money(credit.payLater)}],tables:[{title:tr('Outstanding balances'),columns:[{label:tr('Type'),width:.2},{label:tr('Description'),width:.42},{label:tr('Next due'),width:.16},{label:tr('Amount'),width:.22,end:true}],rows:rows.sort((a,b)=>b.owe-a.owe).map(r=>({cells:[tr(r.type),r.name,r.due?displayDate(r.due):'',(r.owe<0?'+':'')+money(Math.abs(r.owe))],tone:r.owe<0?'in' as const:'out' as const})),empty:tr('Nothing outstanding.')}]};
 }
 if(id==='financial'){
  const held=accounts.filter(a=>a.type!=='Credit card').reduce((s,a)=>s+balance(a,data.transactions),0),debtNet=partyNet.reduce((s,x)=>s+x.net,0)+data.debts.reduce((s,d)=>s+debtSigned(d.type)*(d.amount-(d.paid||0)),0);
  const loanPayments=[...(data.loans||[]),...(data.payLater||[])].reduce((s,r)=>s+creditPaid(r),0);
  return {title:tr(title),subtitle:tr('Everything in this profile, in {0}',currency),period:label,tiles:[{label:tr('Account balances'),value:money(held)},{label:tr('Credit card debt'),value:money(cardsOwed)},{label:tr('Debts (net)'),value:money(debtNet)},{label:tr('Loans you owe'),value:money(credit.owed)},{label:tr('Loans you gave'),value:money(credit.lent)},{label:tr('Pay Later'),value:money(credit.payLater)},{label:tr('Net position'),value:money(held-cardsOwed+debtNet-credit.owed+credit.lent-credit.payLater)},...flowTiles,{label:tr('Paid on loans and Pay Later'),value:money(loanPayments)}],tables:[]};
 }
 return null;
}
