import {addPeriod} from './reminders.ts';
// Loans and Pay Later. The balance is never stored: it is always the original amount less the payments
// recorded on the record, so it cannot drift from the payment history. Amounts are whole minor units.
export const creditFrequencies=['Once','Weekly','Monthly','Quarterly','Yearly'] as const;
export type CreditKind='loans'|'payLater';
export type CreditPayment={id:string;date:string;amount:number;note?:string;void?:boolean};
export type CreditRecord={id:string;name:string;amount:number;description?:string;party?:string;provider?:string;direction?:'borrowed'|'lent';interestRate?:number;start?:string;due?:string;installment?:number;installments?:number;frequency?:string;payments?:CreditPayment[];color?:string;emoji?:string};
export type CreditStatus='Active'|'Pending'|'Paid'|'Overdue';
export const creditPaid=(r:CreditRecord)=>(r.payments||[]).filter(p=>!p.void).reduce((s,p)=>s+p.amount,0);
export function creditSummary(r:CreditRecord,today:string,kind:CreditKind){
 const paid=creditPaid(r),outstanding=Math.max(0,r.amount-paid),repeating=!!r.frequency&&r.frequency!=='Once';
 const count=Math.max(1,r.installments||(r.installment?Math.ceil(r.amount/r.installment):1)),size=r.installment||Math.ceil(r.amount/count);
 const first=kind==='loans'&&repeating&&r.start?addPeriod(r.start,r.frequency,1):r.due||'';
 const schedule=first?Array.from({length:Math.min(repeating?count:1,120)},(_,i)=>({date:i?addPeriod(first,r.frequency,i):first,amount:i===count-1?r.amount-size*(count-1):size,paid:(i+1)*size<=paid||outstanding===0})):[];
 const paidCount=Math.min(Math.floor(paid/size),count);
 let nextDue=!outstanding?'':repeating?schedule[paidCount]?.date||r.due||'':first;
 if(nextDue&&r.due&&kind==='loans'&&nextDue>r.due)nextDue=r.due;
 const status:CreditStatus=!outstanding?'Paid':nextDue&&nextDue<today?'Overdue':kind==='loans'?'Active':'Pending';
 return {paid,outstanding,remaining:outstanding?Math.ceil(outstanding/size):0,nextDue,status,schedule,installmentAmount:size};
}
export function creditTotals(data:{loans?:CreditRecord[];payLater?:CreditRecord[]}){
 const left=(r:CreditRecord)=>Math.max(0,r.amount-creditPaid(r)),loans=data.loans||[];
 return {owed:loans.filter(r=>r.direction!=='lent').reduce((s,r)=>s+left(r),0),lent:loans.filter(r=>r.direction==='lent').reduce((s,r)=>s+left(r),0),payLater:(data.payLater||[]).reduce((s,r)=>s+left(r),0)};
}
// A change to a saved record may add or reverse payments, never rewrite them. The database enforces this too.
export function creditChangeError(prior:CreditRecord|undefined,next:CreditRecord){
 if(creditPaid(next)>next.amount)return 'Payments cannot be more than the amount owed.';
 for(const before of prior?.payments||[]){
  const after=next.payments?.find(p=>p.id===before.id);
  if(!after)return 'A recorded payment cannot be removed. Reverse it instead.';
  if(after.date!==before.date||after.amount!==before.amount||(after.note||'')!==(before.note||''))return 'A recorded payment cannot be changed. Reverse it instead.';
  if(before.void&&!after.void)return 'A reversed payment cannot be restored.';
 }
 return null;
}
