import {createClient} from '../../../lib/supabase/server';
import {reminders,LEAD_DAYS,OVERDUE_DAYS} from '../../../lib/reminders';
import {translate} from '../../../lib/localization';
import {languages} from '../../../lib/i18n';
import {fractionDigits,currencyScale} from '../../../lib/countries';
import type {Data} from '../../../lib/finance';
import {databaseFailure,fetchAll,isAuthOutage,ServiceError} from '../../../lib/api-errors';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const kinds=['accounts','transactions','budgets','goals','debts','shared','recurring','categories','paymentMethods','parties'];
// Open financial reminders across all of the signed-in user's profiles, already worded in their
// language. The Android app polls this in the background so a bill paid anywhere stops notifying.
export async function GET(req:Request){try{
 const db=await createClient();const {data:{user},error}=await db.auth.getUser();
 if(isAuthOutage(error))throw new ServiceError();
 if(error||!user)return Response.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
 const lang=new URL(req.url).searchParams.get('lang')||'en',locale=languages[lang]?.locale||'en-IN',tr=(k:string,...v:unknown[])=>translate(lang,k,...v);
 const ps=await db.from('profiles').select('id,name,currency').eq('owner',user.id).order('slot');if(ps.error)throw databaseFailure(ps.error);
 const ids=(ps.data||[]).map(p=>p.id);
 const rows=ids.length?await fetchAll<{profile:string;kind:string;data:any}>((from,to)=>db.from('records').select('profile,kind,data').in('profile',ids).order('id').range(from,to)):[];
 // The phone's own date, so a bill isn't a day out around midnight; anything else falls back to the server's.
 const asked=new URL(req.url).searchParams.get('today')||'',now=Date.now(),today=/^\d{4}-\d{2}-\d{2}$/.test(asked)&&Math.abs(Date.parse(asked)-now)<2*864e5?asked:new Date(now).toISOString().slice(0,10),multi=ids.length>1;
 const money=(n:number,c:string)=>new Intl.NumberFormat(locale,{style:'currency',currency:c,minimumFractionDigits:fractionDigits(c),maximumFractionDigits:fractionDigits(c)}).format(n/currencyScale(c));
 const items=(ps.data||[]).flatMap(p=>{
  const data=Object.fromEntries(kinds.map(k=>[k,[] as any[]])) as unknown as Data;
  for(const r of rows)if(r.profile===p.id)(data as any)[r.kind]?.push(r.data);
  return reminders(data,p.currency,today).map(x=>({id:p.id+':'+x.id,due:x.due,view:x.view,profile:p.id,
   title:tr(x.kind==='card'?'{0} payment due':x.kind==='goal'?'{0} goal deadline':'{0} is due',x.name),
   body:(x.kind==='goal'?tr('{0} still to save',money(x.amount,x.currency)):money(x.amount,x.currency))+(multi?' · '+p.name:'')}));
 });
 return Response.json({today,leadDays:LEAD_DAYS,overdueDays:OVERDUE_DAYS,items,labels:{inDays:tr('Due in {0} days'),tomorrow:tr('Due tomorrow'),today:tr('Due today'),overdue:tr('Overdue by {0} days'),overdueOne:tr('Overdue by 1 day')}},{headers:{'Cache-Control':'no-store'}});
}catch(e){return Response.json({error:'Could not load reminders.'},{status:e instanceof ServiceError?503:500,headers:{'Cache-Control':'no-store'}})}}
