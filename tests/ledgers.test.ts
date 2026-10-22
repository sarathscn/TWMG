import test from 'node:test';
import assert from 'node:assert/strict';
import {balance,linkedTransactions,totals,partyBalance,splitSharedExpense,type Data,type Transaction} from '../lib/finance.ts';
import {validateLinks} from '../lib/transaction-links.ts';
import {partySchema,sharedSchema} from '../lib/record-schemas.ts';
const a={id:'a',name:'Bank',type:'Bank account',currency:'INR',opening:10000};
const base:Transaction={id:'t',name:'Loan',account:'a',type:'expense',amount:1000,date:'2026-10-21',category:'Other',partyId:'p',debtAction:'lend'};
const data:Data={accounts:[a],transactions:[],parties:[{id:'p',name:'Arjun'}],shared:[{id:'g',name:'Home',amount:0,memberNames:['Me','Arjun']}],recurring:[{id:'r',name:'Internet',amount:99900}],debts:[],budgets:[],goals:[]};
test('Debt movements preserve net worth and never inflate income or expenses',()=>{
 const ts:Transaction[]=[base,{...base,id:'2',type:'income',amount:200,debtAction:'collect'},{...base,id:'3',type:'income',amount:300,debtAction:'borrow'},{...base,id:'4',type:'expense',amount:100,debtAction:'repay'}];
 assert.deepEqual(totals(ts),{income:0,expense:0});assert.equal(partyBalance('p',ts),600);assert.equal(balance(a,ts)+partyBalance('p',ts),10000);
});
test('Links require owned entities, valid debt direction, and matching shared members/currency',()=>{
 validateLinks(base,data,'INR');assert.throws(()=>validateLinks({...base,partyId:'foreign'},data,'INR'));assert.throws(()=>validateLinks({...base,type:'income'},data,'INR'));
 const t={...base,partyId:undefined,debtAction:undefined,sharedGroupId:'g',paidBy:'Me',participants:['Me','Arjun']};validateLinks(t,data,'INR');assert.throws(()=>validateLinks({...t,participants:['Someone else']},data,'INR'));assert.throws(()=>validateLinks(t,data,'BHD'));assert.throws(()=>validateLinks({...t,recurringId:'r'},data,'INR'));
});
test('Linked shared entries retain identity and split odd minor units exactly once',()=>{
 const expense={id:'tx-t',transactionId:'t',name:'Dinner',amount:1001,date:'2026-10-21',paidBy:'Me',participants:['Me','Arjun']};
 const group=sharedSchema.parse({...data.shared[0],members:2,amount:1001,expenses:[expense]});assert.equal(group.expenses![0].transactionId,'t');assert.deepEqual(splitSharedExpense(expense,['Me','Arjun']).map(s=>s.amount),[501,500]);assert.throws(()=>partySchema.parse({id:'p',name:'  '}));
});
test('Ledger links include account transfers and keep each linked entity isolated',()=>{
 const transactions:Transaction[]=[
  {...base,id:'party-1',date:'2026-10-20'},
  {...base,id:'account-in',account:'other',to:'a',type:'transfer',partyId:undefined,debtAction:undefined,amount:500,date:'2026-10-22'},
  {...base,id:'shared-1',account:'other',partyId:undefined,debtAction:undefined,sharedGroupId:'g',amount:700,date:'2026-10-23'},
  {...base,id:'recurring-1',account:'other',partyId:undefined,debtAction:undefined,recurringId:'r',amount:900,date:'2026-10-24'}
 ];
 assert.deepEqual(linkedTransactions('accounts','a',transactions).map(t=>t.id),['account-in','party-1']);
 assert.deepEqual(linkedTransactions('parties','p',transactions).map(t=>t.id),['party-1']);
 assert.deepEqual(linkedTransactions('shared','g',transactions).map(t=>t.id),['shared-1']);
 assert.deepEqual(linkedTransactions('recurring','r',transactions).map(t=>t.id),['recurring-1']);
});
