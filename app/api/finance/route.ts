import {validateLinks} from '../../../lib/transaction-links';
import {sameOrigin} from '../../../lib/request-origin';
import {createClient} from '../../../lib/supabase/server';
import {validateTransaction,overdrawn,cashLikeTypes,isCashMethod,categoryRenameUpdates,groupMembers,removedMembers,withoutMembers,partySyncPlan,type Account,type Item,type Party,type Transaction,categories as defaultCategories} from '../../../lib/finance';
import {z} from 'zod';
import {countryForCurrency} from '../../../lib/countries';
import {categorySchema,paymentMethodSchema,defaultMethods} from '../../../lib/preferences';
import {profileDetailsSchema,countryCurrencies} from '../../../lib/profile';
import {accountSchema as account,itemSchema as item,sharedSchema,partySchema} from '../../../lib/record-schemas';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const kinds=['accounts','transactions','budgets','goals','debts','shared','recurring','categories','paymentMethods','parties'] as const;
const money=z.number().int().safe().nonnegative().max(1e12);
const label=z.string().trim().min(1).max(120);
const transaction=z.object({id:label,name:label,type:z.enum(['income','expense','transfer']),amount:money.positive(),account:label,to:z.string().optional(),received:money.optional(),category:label,partyId:label.optional(),debtAction:z.enum(['lend','borrow','collect','repay']).optional(),sharedGroupId:label.optional(),recurringId:label.optional(),paidBy:z.string().max(120).optional(),participants:z.array(label).min(1).max(100).optional(),paymentMethod:z.string().max(120).optional(),paymentMethodName:z.string().max(80).optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),notes:z.string().max(2000).optional(),tags:z.string().max(250).optional(),splits:z.array(z.object({category:label,amount:money.positive()})).max(20).optional()});

async function context(){const db=await createClient();const {data:{user},error}=await db.auth.getUser();if(error||!user)throw Error('Unauthorized');return {db,user};}
function check(error:{message:string}|null){if(error)throw Error(error.message);}
async function owned(db:Awaited<ReturnType<typeof createClient>>,id:string,owner:string){const {data,error}=await db.from('profiles').select('*').eq('id',id).eq('owner',owner).maybeSingle();check(error);if(!data)throw Error('Profile not found');return data;}
async function load(db:Awaited<ReturnType<typeof createClient>>,id:string){const {data:rows,error}=await db.from('records').select('id,kind,data').eq('profile',id);check(error);const data:Record<string,any[]>={};kinds.forEach(k=>data[k]=[]);rows?.forEach(r=>data[r.kind]?.push({...r.data,id:r.id}));return data;}
// Applies a debt-party plan from partySyncPlan: links, new members, and parties a group created.
async function applyParties(db:Awaited<ReturnType<typeof createClient>>,profile:string,plan:ReturnType<typeof partySyncPlan>){
 if(plan.upserts.length){const {error}=await db.from('records').upsert(plan.upserts.map(p=>({id:p.id,profile,kind:'parties',data:p})),{onConflict:'id'});check(error);}
 for(const p of plan.deletes){const {error}=await db.from('records').delete().eq('id',p.id).eq('profile',profile).eq('kind','parties');check(error);}
}
function failure(e:unknown){const requestId=crypto.randomUUID();const message=e instanceof z.ZodError?e.issues.map(i=>i.message).join(' '):e instanceof Error?e.message:'Request failed';const status=message==='Unauthorized'?401:message==='Profile not found'?404:400;return Response.json({error:message,requestId},{status,headers:{'Cache-Control':'no-store'}})}
export async function GET(req:Request){try{
 const {db,user}=await context();let {data:ps,error}=await db.from('profiles').select('*').eq('owner',user.id).order('slot');check(error);
 if(!ps?.length){const result=await db.from('profiles').upsert({owner:user.id,slot:0,name:'Personal',country:'India',currency:'INR'},{onConflict:'owner,slot',ignoreDuplicates:true});check(result.error);const result2=await db.from('profiles').select('*').eq('owner',user.id).order('slot');check(result2.error);ps=result2.data;}
 if(!ps?.length)throw Error('Could not load your profiles.');
 const params=new URL(req.url).searchParams,id=params.get('profile')||ps[0].id;const selected=await owned(db,id,user.id);
 if(!selected.options_initialized||!selected.payment_countries?.includes(selected.country)){
 const current=await load(db,id);const names=[...new Set([...defaultCategories,...current.transactions.flatMap((t:Transaction)=>[t.category,...(t.splits?.map(s=>s.category)||[])]),...current.budgets.map(b=>b.category).filter(Boolean)])];
 const {error}=await db.rpc('initialize_profile_options',{target:id,category_rows:names.map((name,i)=>({id:id+'-cat-'+i,name,color:'#2d634a'})),method_rows:defaultMethods(selected.country).map((m,i)=>({id:id+'-pay-'+selected.country.replaceAll(' ','')+'-'+i,name:m.name,country:selected.country,enabled:true,custom:false,source:m.source}))});check(error);
 }
 const accountSettings=await db.from('account_settings').select('username,display_name').eq('user_id',user.id).maybeSingle();check(accountSettings.error);
 if(params.has('history')){const result=await db.from('history').select('action,created,before,after').eq('profile',id).eq('record',params.get('history')!).order('created',{ascending:false}).limit(100);check(result.error);return Response.json({history:result.data},{headers:{'Cache-Control':'no-store'}})}
 return Response.json({profiles:ps,profile:id,data:await load(db,id),user:{name:user.user_metadata?.full_name||user.email?.split('@')[0]||'You',email:user.email,username:accountSettings.data?.username||'',displayName:accountSettings.data?.display_name||''}},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 if(!sameOrigin(req))throw Error('Invalid request origin');
 const {db,user}=await context();const raw=await req.text();if(raw.length>200000)throw Error('Request too large');
 const body=z.object({action:z.string().optional(),profile:z.string().optional(),kind:z.string().optional(),id:z.string().optional(),value:z.record(z.string(),z.unknown()).optional()}).parse(JSON.parse(raw));
 if(body.action==='profile_update'||body.action==='profile'){
 const p=profileDetailsSchema.parse(body.value);
 if(body.action==='profile_update'){const id=z.string().uuid().parse(body.profile);await owned(db,id,user.id);const existing=await load(db,id);const {error}=await db.from('profiles').update({name:p.name,username:null,bio:p.bio||null,avatar:p.avatar||null,emoji:p.emoji||null,color:p.color||null,country:p.country,...(!existing.accounts.length&&!existing.transactions.length?{currency:countryCurrencies[p.country]}:{})}).eq('id',id).eq('owner',user.id);check(error);return Response.json({id})}
 const result=await db.from('profiles').select('slot').eq('owner',user.id);check(result.error);const slot=[0,1,2].find(s=>!result.data?.some(p=>p.slot===s));if(slot===undefined)throw Error('You can create up to three profiles.');
 const id=crypto.randomUUID();const {error}=await db.from('profiles').insert({id,owner:user.id,slot,name:p.name,country:p.country,currency:countryCurrencies[p.country],username:null,bio:p.bio||null,avatar:p.avatar||null,emoji:p.emoji||null,color:p.color||null});check(error);return Response.json({id});
 }
 const profile=z.string().uuid().parse(body.profile),profileRow=await owned(db,profile,user.id);
 if(body.action==='import'){
 const input=z.object({accounts:z.array(account).max(50),transactions:z.array(transaction).max(150),budgets:z.array(item).max(50),goals:z.array(item).max(50),debts:z.array(item).max(50),shared:z.array(sharedSchema).max(50),recurring:z.array(item).max(50),parties:z.array(partySchema).max(100).optional(),categories:z.array(categorySchema).max(100).optional(),paymentMethods:z.array(paymentMethodSchema).max(100).optional()}).parse(body.value?.data);
 const rows=Object.entries(input).flatMap(([kind,list])=>(list||[]).map(value=>({kind,value})));if(rows.length>200)throw Error('Import up to 200 records at a time.');const linkIds=new Map(rows.filter(r=>['parties','shared','recurring'].includes(r.kind)).map(r=>[r.value.id,crypto.randomUUID()]));const transactionIds=new Map(input.transactions.map(t=>[t.id,crypto.randomUUID()]));const methodIds=new Map((input.paymentMethods||[]).map(m=>[m.id,crypto.randomUUID()]));const ids=new Map(input.accounts.map(a=>[a.id,crypto.randomUUID()]));if(ids.size!==input.accounts.length)throw Error('Duplicate account identifiers in backup.');input.transactions.forEach(t=>validateTransaction(t,input.accounts));
 const mapped=rows.map(({kind,value})=>{const id=kind==='accounts'?ids.get(value.id)!:kind==='paymentMethods'?methodIds.get(value.id)!:kind==='transactions'?transactionIds.get(value.id)!:linkIds.get(value.id)||crypto.randomUUID(),tx=value as Transaction;return{id,profile,kind,data:{...value,id,...(kind==='parties'&&(value as any).sharedGroupIds?{sharedGroupIds:(value as any).sharedGroupIds.map((g:string)=>linkIds.get(g)).filter(Boolean)}:{}),...(kind==='shared'?{expenses:(value as any).expenses?.map((e:any)=>({...e,transactionId:e.transactionId?transactionIds.get(e.transactionId):undefined}))}:{}),...(kind==='transactions'?{partyId:tx.partyId?linkIds.get(tx.partyId):undefined,sharedGroupId:tx.sharedGroupId?linkIds.get(tx.sharedGroupId):undefined,recurringId:tx.recurringId?linkIds.get(tx.recurringId):undefined,account:ids.get(tx.account),to:tx.to?ids.get(tx.to):undefined,paymentMethod:tx.paymentMethod?methodIds.get(tx.paymentMethod):undefined}:{})}}});const {error}=await db.from('records').insert(mapped);check(error);return Response.json({ok:true});
 }
 const kind=z.enum(kinds).parse(body.kind);
 if(body.action==='delete'){
 if(kind==='accounts'){const data=await load(db,profile);if(data.transactions.some((t:Transaction)=>t.account===body.id||t.to===body.id))throw Error('This account has transaction history. Remove its transactions first.');}
 if(kind==='transactions'){const data=await load(db,profile),gone=data.transactions.find((x:Transaction)=>x.id===body.id),over=gone?overdrawn(data.accounts as Account[],data.transactions,data.transactions.filter((x:Transaction)=>x.id!==body.id),[gone.account,gone.to]):[];if(over.length)throw Error(`Deleting this would take ${over[0].name} below zero. Cash and wallet balances can't be negative.`);}
 let groupBefore:Item|undefined,partyData:any;
 if(kind==='parties'){const data=await load(db,profile),party=data.parties.find((p:Party)=>p.id===body.id),group=party?.sharedGroupIds?.map((g:string)=>data.shared.find((x:Item)=>x.id===g)).find(Boolean);if(group)throw Error(`${party.name} is a member of ${group.name}. Remove them from the group first.`);}
 if(kind==='shared'){partyData=await load(db,profile);groupBefore=partyData.shared.find((g:Item)=>g.id===body.id);}
 const {error}=await db.from('records').delete().eq('id',z.string().parse(body.id)).eq('profile',profile).eq('kind',kind);check(error);
 if(groupBefore)await applyParties(db,profile,partySyncPlan(partyData.parties,partyData.transactions,groupBefore,undefined));
 return Response.json({ok:true});}
 // Split groups: members who leave drop out of every split, including the account transactions
 // linked to the group, and the debt parties follow the member list.
 let groupSync:{before?:Item;data:any;transactions:Transaction[]}|undefined;
 if(kind==='shared'&&body.value){const data=await load(db,profile),raw=body.value as any,before=data.shared.find((g:Item)=>g.id===raw.id) as Item|undefined;
  const gone=before&&Array.isArray(raw.memberNames)?removedMembers(groupMembers(before),raw.memberNames):[];
  if(gone.length&&Array.isArray(raw.expenses))raw.expenses=withoutMembers(raw.expenses,gone);
  groupSync={before,data,transactions:[]};}
 const value=(kind==='parties'?partySchema:kind==='categories'?categorySchema:kind==='paymentMethods'?paymentMethodSchema:kind==='accounts'?account:kind==='transactions'?transaction:kind==='shared'?sharedSchema:item).parse({...body.value,id:body.value?.id||crypto.randomUUID()});
 if(groupSync){const g=value as Item;for(const t of groupSync.data.transactions as Transaction[]){if(t.sharedGroupId!==g.id)continue;const e=g.expenses?.find(x=>x.transactionId===t.id);if(e?.participants&&JSON.stringify(e.participants)!==JSON.stringify(t.participants))groupSync.transactions.push({...t,participants:e.participants});}}
 if(kind==='parties'){const data=await load(db,profile),existing=data.parties.find((p:Party)=>p.id===value.id) as Party|undefined,v=value as Party;
  // Group links are managed by the server; editing a party by hand keeps it even after its groups go.
  if(existing?.sharedGroupIds?.length&&existing.name.trim().toLowerCase()!==v.name.trim().toLowerCase())throw Error('This person is a member of a shared group. Remove them from the group before renaming.');
  if(existing?.sharedGroupIds?.length)v.sharedGroupIds=existing.sharedGroupIds;else delete v.sharedGroupIds;delete v.autoCreated;}
 if(kind==='transactions'&&(value as Transaction).type!=='transfer'){delete (value as Transaction).to;delete (value as Transaction).received;}
 if(kind==='transactions'){const data=await load(db,profile);validateTransaction(value as Transaction,data.accounts as Account[]);const t=value as Transaction;validateLinks(t,data as any,profileRow.currency);
 const prior=data.transactions.find((x:Transaction)=>x.id===t.id),src=data.accounts.find((a:Account)=>a.id===t.account);
 if(src&&t.type!=='transfer'&&(!prior||prior.account!==t.account||prior.paymentMethod!==t.paymentMethod)){const chosen=data.paymentMethods.find((m:any)=>m.id===t.paymentMethod);if(cashLikeTypes.includes(src.type)){if(chosen&&!isCashMethod(chosen.name))throw Error('Cash and wallet accounts record the Cash payment method.');if(!chosen){const country=src.country||countryForCurrency(src.currency,profileRow.country),cash=data.paymentMethods.find((m:any)=>isCashMethod(m.name)&&m.enabled&&m.country===country);if(cash)t.paymentMethod=cash.id;}}else if(chosen&&isCashMethod(chosen.name))throw Error('Cash payments must use a Cash or Wallet account.');}
 const over=overdrawn(data.accounts as Account[],data.transactions,[...data.transactions.filter((x:Transaction)=>x.id!==t.id),t],[t.account,t.to,prior?.account,prior?.to]);if(over.length)throw Error(`This would take ${over[0].name} below zero. Cash and wallet balances can't be negative.`);
 if(t.paymentMethod){const method=data.paymentMethods.find(m=>m.id===t.paymentMethod);const previous=data.transactions.find(x=>x.id===t.id);const sourceAccount=data.accounts.find(a=>a.id===t.account);const contextCountry=sourceAccount?.country||countryForCurrency(sourceAccount?.currency,profileRow.country);const keeping=previous?.paymentMethod===t.paymentMethod&&previous?.account===t.account;if(!method&&keeping){t.paymentMethodName=previous.paymentMethodName;}else{if(!method||((!method.enabled||method.country!==contextCountry)&&!keeping))throw Error('Choose an enabled payment method for the account country.');t.paymentMethodName=keeping?(previous.paymentMethodName||method.name):method.name}}else delete t.paymentMethodName;}
 if(kind==='accounts'){const data=await load(db,profile),existing=data.accounts.find((a:Account)=>a.id===value.id);if(existing&&existing.currency!==(value as Account).currency&&data.transactions.some((t:Transaction)=>t.account===value.id||t.to===value.id))throw Error('Currency cannot change once an account has transactions.');const next=value as Account,over=overdrawn(data.accounts as Account[],data.transactions,data.transactions,[next.id],[...data.accounts.filter((a:Account)=>a.id!==next.id),next]);if(over.length)throw Error(`${next.name} can't have a negative balance. Cash and wallet balances must stay at zero or above.`)}
 // Budgets and recurring bills link to a category by name, so a rename carries over to them.
 // Past transactions keep the category name they were recorded with.
 let renamed:ReturnType<typeof categoryRenameUpdates>=[];
 if(kind==='parties'||kind==='categories'||kind==='paymentMethods'){const data=await load(db,profile);if(data[kind].some(x=>x.id!==value.id&&x.name.trim().toLowerCase()===value.name.trim().toLowerCase()&&(kind!=='paymentMethods'||x.country===(value as any).country)))throw Error('This name already exists.');if(kind==='paymentMethods'){const m=value as any,preset=defaultMethods(m.country).find(x=>x.name===m.name);m.custom=!preset;m.source=preset?.source;}
 const before=kind==='categories'?data.categories.find(x=>x.id===value.id):undefined;if(before)renamed=categoryRenameUpdates(data as any,before.name,value.name);}
 if(!['accounts','transactions','categories','paymentMethods','parties'].includes(kind)){const record=value as {amount:number;paid?:number};if(record.paid&&record.paid>record.amount)throw Error('Repaid amount cannot exceed the total.')}
 // Linked transactions first: they must still fit the old member list when they change.
 for(const t of groupSync?.transactions||[]){const r=await db.from('records').update({data:t}).eq('id',t.id).eq('profile',profile).eq('kind','transactions');check(r.error);}
 const {error}=await db.from('records').upsert({id:value.id,profile,kind,data:value},{onConflict:'id'});check(error);
 if(groupSync)await applyParties(db,profile,partySyncPlan(groupSync.data.parties,groupSync.data.transactions,groupSync.before,value as Item));
 if(renamed.length){const moved=await db.from('records').upsert(renamed.map(({kind,value:r})=>({id:r.id,profile,kind,data:r})),{onConflict:'id'});check(moved.error);}
 return Response.json({ok:true});
}catch(e){return failure(e)}}
export const PUT=POST;
