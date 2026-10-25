export type Account={id:string;name:string;type:string;country?:string;currency:string;opening:number;limit?:number;due?:string;cardType?:string;lastFour?:string;color?:string;emoji?:string;institution?:string;reference?:string};
// Short identifier shown next to an account: "HDFC Bank •••• 1234", "Paytm · ref sarath@ok".
export function accountReference(a:Pick<Account,'type'|'institution'|'lastFour'|'reference'|'cardType'>){const parts=[a.type==='Credit card'?a.cardType:a.institution,a.lastFour?'•••• '+a.lastFour:a.reference].filter(Boolean);return parts.join(' · ')}
// sharedGroupIds: the split groups this person is a member of (kept in sync by the server).
// autoCreated: the party was added by a group, so it can be removed with its last group.
export type Party={id:string;name:string;notes?:string;color?:string;emoji?:string;sharedGroupIds?:string[];autoCreated?:boolean};
export type Transaction={id:string;name:string;type:'income'|'expense'|'transfer';amount:number;account:string;to?:string;received?:number;category:string;date:string;partyId?:string;debtAction?:'lend'|'borrow'|'collect'|'repay';sharedGroupId?:string;recurringId?:string;paidBy?:string;participants?:string[];paymentMethod?:string;paymentMethodName?:string;notes?:string;tags?:string;splits?:{category:string;amount:number}[]};
export type SharedExpense={id:string;name:string;amount:number;date:string;paidBy:string;notes?:string;participants?:string[];transactionId?:string};
// self: the member name that stands for the signed-in user in a shared group.
export type Item={id:string;name:string;amount:number;target?:number;category?:string;due?:string;type?:string;paid?:number;party?:string;members?:number;status?:string;expenses?:SharedExpense[];memberNames?:string[];self?:string;color?:string;emoji?:string};
export function sharedEntries(group:Item):SharedExpense[]{return group.expenses??(group.amount>0?[{id:'opening-'+group.id,name:'Existing group expenses',amount:group.amount,date:group.due||new Date().toISOString().slice(0,10),paidBy:'',notes:'Preserved from the original group balance.'}]:[])}
export function sharedTotal(expenses:SharedExpense[]){return expenses.reduce((sum,e)=>sum+e.amount,0)}
export function parseMemberNames(value:string){return value.split(/[,\n]/).map(n=>n.trim()).filter(Boolean)}
export function groupMembers(group:Item):string[]{
 if(group.memberNames)return group.memberNames;
 const names:string[]=[];
 for(const name of [...parseMemberNames(group.party||''),...sharedEntries(group).map(e=>e.paidBy).filter(Boolean)])if(!names.some(n=>n.toLowerCase()===name.toLowerCase()))names.push(name);
 let i=1;while(names.length<Math.max(2,group.members||0)){const name=`Member ${i++}`;if(!names.includes(name))names.push(name)}
 return names;
}
export function splitSharedExpense(expense:SharedExpense,members:string[]){
 const selected=members.filter(name=>!expense.participants||expense.participants.includes(name));
 const base=selected.length?Math.floor(expense.amount/selected.length):0,remainder=selected.length?expense.amount%selected.length:0;
 return selected.map((name,i)=>({name,amount:base+(i<remainder?1:0)}));
}
const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const selfWords=['me','myself','you'];
// The member who is the signed-in user: the saved one, or for older groups a member named
// after the user or "Me"/"You".
export function groupSelf(group:Item,userName=''):string|undefined{const names=groupMembers(group);if(group.self&&names.includes(group.self))return group.self;return names.find(n=>(userName&&same(n,userName))||selfWords.includes(n.trim().toLowerCase()))}
// Members in `before` that are gone from `after` (names compare case-insensitively).
export function removedMembers(before:string[],after:string[]){return before.filter(n=>!after.some(m=>same(m,n)))}
// Group transactions after `removed` members leave: they drop out of every split, so the
// remaining participants share each amount. A removed payer, or a transaction left with
// nobody to split it, can't be resolved automatically and is reported instead.
export function withoutMembers(expenses:SharedExpense[],removed:string[]){
 const gone=(n:string)=>removed.some(r=>same(r,n));
 const payer=expenses.find(e=>e.paidBy&&gone(e.paidBy));
 if(payer)throw Error(`${payer.paidBy} paid for “${payer.name}”. Change who paid before removing them from the group.`);
 return expenses.map(e=>{if(!e.participants?.some(gone))return e;const participants=e.participants.filter(n=>!gone(n));if(!participants.length)throw Error(`“${e.name}” would have nobody left to split it. Edit or delete it first.`);return {...e,participants}});
}
// Debt parties that follow a split group's members: every member except the user has a party
// (an existing one with the same name is reused, never duplicated). When a member leaves, or the
// group is deleted, the link is dropped, and a party the group created is removed once nothing
// else uses it. `before`/`after` are the group before and after the change (undefined = none).
export function partySyncPlan(parties:Party[],transactions:Pick<Transaction,'partyId'>[],before:Item|undefined,after:Item|undefined,newId:()=>string=()=>crypto.randomUUID()){
 const gid=(after||before)?.id;if(!gid)return {upserts:[] as Party[],deletes:[] as Party[]};
 const others=(g?:Item)=>{if(!g)return [];const self=groupSelf(g);return groupMembers(g).filter(n=>n!==self)};
 const next=others(after);
 const list=parties.map(p=>({...p})),changed=new Set<string>(),deletes:Party[]=[];
 for(const name of next){
  const party=list.find(p=>same(p.name,name));
  if(!party){const created:Party={id:newId(),name:name.trim().slice(0,120),sharedGroupIds:[gid],autoCreated:true};list.push(created);changed.add(created.id);continue}
  if(!party.sharedGroupIds?.includes(gid)){party.sharedGroupIds=[...(party.sharedGroupIds||[]),gid];changed.add(party.id)}
 }
 for(const party of list){
  if(!party.sharedGroupIds?.includes(gid)||next.some(n=>same(n,party.name)))continue;
  party.sharedGroupIds=party.sharedGroupIds.filter(id=>id!==gid);
  if(party.autoCreated&&!party.sharedGroupIds.length&&!transactions.some(t=>t.partyId===party.id)){deletes.push(party);changed.delete(party.id)}else changed.add(party.id);
 }
 return {upserts:list.filter(p=>changed.has(p.id)),deletes};
}
export function sharedMemberBalances(group:Item){
 const names=groupMembers(group),entries=sharedEntries(group);
 return names.map(name=>{let paid=0,share=0;for(const expense of entries){if(expense.paidBy===name)paid+=expense.amount;share+=splitSharedExpense(expense,names).find(s=>s.name===name)?.amount||0}return{name,paid,share,net:paid-share}});
}
export type Profile={id:string;name:string;country:string;currency:string;username?:string;bio?:string;avatar?:string;emoji?:string;color?:string};
export type Data={accounts:Account[];transactions:Transaction[];budgets:Item[];goals:Item[];debts:Item[];shared:Item[];recurring:Item[];parties?:Party[];categories?:import('./preferences').Category[];paymentMethods?:import('./preferences').PaymentMethod[]};
export type LedgerKind='accounts'|'parties'|'shared'|'recurring';
export const categories=['Food & dining','Shopping','Transport','Home & utilities','Entertainment','Health','Travel','Salary','Freelance','Other'];
export function balance(a:Account,ts:Transaction[]){return a.opening+ts.reduce((s,t)=>s+(t.account===a.id?(t.type==='income'?t.amount:-t.amount):0)+(t.type==='transfer'&&t.to===a.id?(t.received??t.amount):0),0)}
// Cash and wallets hold real money, so they can't be overdrawn; cash and physical
// wallets always record the "Cash" payment method.
export const nonNegativeTypes=['Cash','Wallet','Digital Wallet'];
export const cashLikeTypes=['Cash','Wallet'];
export const isCashMethod=(name?:string)=>name?.trim().toLowerCase()==='cash';
// Non-negative accounts (among `ids`) that the change from `before` to `after` would push below zero,
// or further below zero for legacy balances. `nextAccounts` lets a pending account edit be checked.
export function overdrawn(accounts:Account[],before:Transaction[],after:Transaction[],ids:(string|undefined)[],nextAccounts:Account[]=accounts){return nextAccounts.filter(a=>ids.includes(a.id)&&nonNegativeTypes.includes(a.type)).filter(a=>{const old=accounts.find(x=>x.id===a.id),now=balance(a,after);return now<0&&now<(old?balance(old,before):0)})}
// Budgets and recurring bills that follow a category rename. Budgets named after their
// category are renamed too; past transactions keep the name they were recorded with.
export function categoryRenameUpdates(data:Pick<Data,'budgets'|'recurring'>,from:string,to:string){if(from===to)return [];return [...data.budgets.map(r=>({kind:'budgets' as const,r})),...data.recurring.map(r=>({kind:'recurring' as const,r}))].filter(({r})=>r.category===from).map(({kind,r})=>({kind,value:{...r,category:to,...(kind==='budgets'&&r.name===from?{name:to}:{})}}))}
export function totals(ts:Transaction[]){return ts.reduce((s,t)=>({income:s.income+(t.type==='income'&&!t.partyId?t.amount:0),expense:s.expense+(t.type==='expense'&&!t.partyId?t.amount:0)}),{income:0,expense:0})}
export function partyBalance(id:string,ts:Transaction[]){return ts.filter(t=>t.partyId===id).reduce((s,t)=>s+(['lend','repay'].includes(t.debtAction||'')?t.amount:-t.amount),0)}
export function linkedTransactions(kind:LedgerKind,id:string,ts:Transaction[]){return ts.filter(t=>kind==='accounts'?(t.account===id||t.to===id):kind==='parties'?t.partyId===id:kind==='shared'?t.sharedGroupId===id:t.recurringId===id).sort((a,b)=>b.date.localeCompare(a.date))}
export function validateTransaction(t:Transaction,accounts:Account[]){
 if(!Number.isSafeInteger(t.amount)||t.amount<=0)throw Error('Enter a positive amount in the account currency.');
 if(!accounts.some(a=>a.id===t.account))throw Error('Choose an account in this profile.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||Number.isNaN(Date.parse(t.date))||new Date(t.date).toISOString().slice(0,10)!==t.date)throw Error('Choose a valid date.');
 if(t.type==='transfer'){
  const a=accounts.find(a=>a.id===t.account),b=accounts.find(a=>a.id===t.to);
  if(!b||a?.id===b.id)throw Error('Choose a different destination account.');
  if(a?.currency===b.currency&&t.received!==undefined&&t.received!==t.amount)throw Error('For the same currency, the received amount must equal the amount sent.');
  if(a?.currency!==b.currency&&(!Number.isSafeInteger(t.received)||!t.received||t.received<=0))throw Error('Enter the amount received in the destination currency.');
 }
 if(t.splits?.length&&t.splits.reduce((s,x)=>s+x.amount,0)!==t.amount)throw Error('Split amounts must equal the transaction amount.');
}
export function seed(currency='INR'):Data{
 const month=new Date().toISOString().slice(0,7);const date=(d:number)=>`${month}-${String(d).padStart(2,'0')}`;
 const accounts:Account[]=[{id:'bank',name:'HDFC Bank',type:'Bank account',currency,opening:18450000},{id:'savings',name:'Rainy day fund',type:'Savings',currency,opening:12500000},{id:'cash',name:'Cash wallet',type:'Cash',currency,opening:850000},{id:'card',name:'HDFC Millennia',type:'Credit card',currency,opening:-1250000,limit:20000000,due:date(28)}];
 const rows:[string,Transaction['type'],number,string,string,number][]=[['Monthly salary','income',95000,'bank','Salary',1],['Apartment rent','expense',18000,'bank','Home & utilities',2],['Freelance design','income',12500,'bank','Freelance',5],['Weekly groceries','expense',2450,'bank','Food & dining',5],['Amazon shopping','expense',3499,'card','Shopping',8],['Uber ride','expense',340,'bank','Transport',9],['Electricity bill','expense',1850,'bank','Home & utilities',10],['Weekend dinner','expense',1820,'card','Food & dining',11],['Spotify Premium','expense',119,'bank','Entertainment',12],['Zomato order','expense',485,'bank','Food & dining',14],['Fuel refill','expense',2000,'bank','Transport',15],['Nike running shoes','expense',4995,'card','Shopping',16],['Coffee at Third Wave','expense',320,'bank','Food & dining',18],['Netflix subscription','expense',649,'card','Entertainment',19],['Fresh vegetables','expense',680,'cash','Food & dining',20]];
 return {accounts,transactions:rows.map((r,i)=>({id:`tx${i}`,name:r[0],type:r[1],amount:r[2]*100,account:r[3],category:r[4],date:date(r[5])})),budgets:[{id:'b1',name:'Food & dining',category:'Food & dining',amount:1000000},{id:'b2',name:'Shopping',category:'Shopping',amount:1200000},{id:'b3',name:'Transport',category:'Transport',amount:500000}],goals:[{id:'g1',name:'Japan, here we come',amount:8500000,target:15000000,due:'2027-04-01'},{id:'g2',name:'Emergency fund',amount:12500000,target:30000000}],debts:[{id:'d1',name:'Weekend trip',party:'Arjun',type:'Lent',amount:450000,paid:150000,due:date(25)}],shared:[{id:'s1',name:'October apartment expenses',party:'Arjun, Meera',amount:2400000,paid:800000,members:3,due:date(28)}],recurring:[{id:'r1',name:'Netflix Premium',amount:64900,due:date(22),type:'Monthly',category:'Entertainment'},{id:'r2',name:'Internet · Airtel',amount:99900,due:date(24),type:'Monthly',category:'Home & utilities'},{id:'r3',name:'Apartment rent',amount:1800000,due:date(28),type:'Monthly',category:'Home & utilities'}]};
}
// Transaction filters shared by the Transactions list and Reports. Every set filter must match.
// "any" for shared/recurring means "linked to any group / any bill".
export type TxFilters={account?:string;party?:string;category?:string;shared?:string;recurring?:string};
export const filterKeys=['account','party','category','shared','recurring'] as const;
export function activeFilters(f:TxFilters){return filterKeys.filter(k=>!!f[k])}
export function applyFilters(ts:Transaction[],f:TxFilters){
 return ts.filter(t=>(!f.account||t.account===f.account||t.to===f.account)
  &&(!f.party||t.partyId===f.party)
  &&(!f.category||(t.type!=='transfer'&&(t.splits?.length?t.splits.some(s=>s.category===f.category):t.category===f.category)))
  &&(!f.shared||(f.shared==='any'?!!t.sharedGroupId:t.sharedGroupId===f.shared))
  &&(!f.recurring||(f.recurring==='any'?!!t.recurringId:t.recurringId===f.recurring)));
}
// Amount of a transaction that belongs to a category (split transactions count only their part).
export function categoryAmount(t:Transaction,category:string){return t.splits?.length?t.splits.filter(s=>s.category===category).reduce((s,x)=>s+x.amount,0):t.category===category?t.amount:0}
// Per-account money in and out for the account diagram. Transfers count as out of the source
// and into the destination; debt movements count too, since they move real money.
export function accountActivity(accounts:Account[],ts:Transaction[]){
 return accounts.map(a=>{let income=0,expense=0;for(const t of ts){if(t.account===a.id){if(t.type==='income')income+=t.amount;else expense+=t.amount}if(t.type==='transfer'&&t.to===a.id)income+=t.received??t.amount}return {id:a.id,name:a.name,currency:a.currency,income,expense}});
}
