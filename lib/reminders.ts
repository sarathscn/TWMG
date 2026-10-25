import {balance,type Data} from './finance.ts';
// Financial reminders shared by the web app and the /api/reminders endpoint the Android app polls.
// Each reminder is an open obligation; anything already completed is simply not returned, which is
// how a phone learns to stop notifying.
export type ReminderKind='card'|'recurring'|'debt'|'shared'|'goal';
export type Reminder={id:string;kind:ReminderKind;name:string;due:string;amount:number;currency:string;view:string};
export const LEAD_DAYS=7,OVERDUE_DAYS=30,MAX_CYCLES=36;
const iso=(d:Date)=>d.toISOString().slice(0,10);
const parse=(s:string)=>new Date(s+'T00:00:00Z');
export const addDays=(s:string,n:number)=>{const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
// Same day next/previous period, clamped to month end (31 Jan + 1 month = 28/29 Feb).
export function addPeriod(s:string,type:string|undefined,n:number){
 if(type==='Weekly')return addDays(s,7*n);
 const d=parse(s),day=d.getUTCDate(),months=type==='Yearly'?12*n:n;
 const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1));
 t.setUTCDate(Math.min(day,new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate()));
 return iso(t);
}
// First unpaid cycle of a repeating due date. Payments made after the previous cycle's due date pay
// cycles in order, so paying a bill moves its reminder to the next cycle immediately.
export function openCycle(firstDue:string,type:string|undefined,paymentDates:string[]){
 const since=addPeriod(firstDue,type,-1),paid=paymentDates.filter(d=>d>since).length;
 return addPeriod(firstDue,type,Math.min(paid,MAX_CYCLES));
}
const valid=(s?:string)=>!!s&&/^\d{4}-\d{2}-\d{2}$/.test(s);
// Open reminders whose first notification (7 days before) is within `horizon` days, or that are overdue
// by at most OVERDUE_DAYS.
export function reminders(data:Data,baseCurrency:string,today:string,horizon=60):Reminder[]{
 const out:Reminder[]=[],latest=addDays(today,horizon),earliest=addDays(today,-OVERDUE_DAYS);
 const keep=(due:string)=>due<=latest&&due>=earliest;
 for(const r of data.recurring){
  if(!valid(r.due))continue;
  const due=openCycle(r.due!,r.type,data.transactions.filter(t=>t.recurringId===r.id).map(t=>t.date));
  if(keep(due))out.push({id:'recurring:'+r.id,kind:'recurring',name:r.name,due,amount:r.amount,currency:baseCurrency,view:'Recurring'});
 }
 for(const a of data.accounts){
  if(a.type!=='Credit card'||!valid(a.due))continue;
  const owed=-balance(a,data.transactions);
  if(owed<=0)continue;
  const due=openCycle(a.due!,'Monthly',data.transactions.filter(t=>t.type==='transfer'&&t.to===a.id).map(t=>t.date));
  if(keep(due))out.push({id:'card:'+a.id,kind:'card',name:a.name,due,amount:owed,currency:a.currency,view:'Credit cards'});
 }
 for(const d of data.debts){const left=d.amount-(d.paid||0);if(valid(d.due)&&left>0&&keep(d.due!))out.push({id:'debt:'+d.id,kind:'debt',name:d.name,due:d.due!,amount:left,currency:baseCurrency,view:'Debts'})}
 for(const g of data.shared){const left=g.amount-(g.paid||0);if(valid(g.due)&&left>0&&keep(g.due!))out.push({id:'shared:'+g.id,kind:'shared',name:g.name,due:g.due!,amount:left,currency:baseCurrency,view:'Shared expenses'})}
 for(const g of data.goals){const left=(g.target||0)-g.amount;if(valid(g.due)&&left>0&&keep(g.due!))out.push({id:'goal:'+g.id,kind:'goal',name:g.name,due:g.due!,amount:left,currency:baseCurrency,view:'Budgets & goals'})}
 return out.sort((x,y)=>x.due.localeCompare(y.due)||x.id.localeCompare(y.id));
}
