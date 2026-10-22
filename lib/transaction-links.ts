import {groupMembers,type Data,type Transaction} from './finance.ts';
export function validateLinks(t:Transaction,data:Data,baseCurrency:string){
 if([t.partyId,t.sharedGroupId,t.recurringId].filter(Boolean).length>1)throw Error('Link a transaction to one party, shared group, or recurring bill.');
 if(t.partyId){
  if(!data.parties?.some(p=>p.id===t.partyId))throw Error('Choose a debt party in this profile.');
  const expected={lend:'expense',borrow:'income',collect:'income',repay:'expense'};
  if(!t.debtAction||expected[t.debtAction]!==t.type)throw Error('Choose the correct debt movement and transaction direction.');
 }else if(t.debtAction)throw Error('Choose a debt party for this movement.');
 if(t.sharedGroupId){
  const group=data.shared.find(g=>g.id===t.sharedGroupId),account=data.accounts.find(a=>a.id===t.account);
  if(!group)throw Error('Choose a shared group in this profile.');
  if(t.type!=='expense'||account?.currency!==baseCurrency)throw Error('Shared expenses must use an expense account in the profile currency.');
  const names=groupMembers(group);
  if(!t.paidBy||!names.includes(t.paidBy)||!t.participants?.length||new Set(t.participants).size!==t.participants.length||t.participants.some(n=>!names.includes(n)))throw Error('Choose the payer and split members from this group.');
  if((t.notes?.length||0)>1000)throw Error('Shared expense notes can contain up to 1,000 characters.');
 }
 if(t.recurringId&&(!data.recurring.some(r=>r.id===t.recurringId)||t.type!=='expense'||data.accounts.find(a=>a.id===t.account)?.currency!==baseCurrency))throw Error('Choose a recurring bill and an expense account in the profile currency.');
}
