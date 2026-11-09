// Per-instance request limits for the API routes. Serverless instances don't share memory, so this slows
// abuse rather than capping it exactly; a platform firewall rule is the stronger control.
const hits=new Map<string,{count:number;resets:number}>();
export function allowRequest(key:string,limit:number,windowMs=60000,now=Date.now()){
 if(hits.size>5000)for(const [k,v] of hits)if(v.resets<=now)hits.delete(k);
 const entry=hits.get(key);
 if(!entry||entry.resets<=now){hits.set(key,{count:1,resets:now+windowMs});return true}
 entry.count++;
 return entry.count<=limit;
}
export const tooManyRequests=()=>Response.json({error:'Too many requests. Please wait a moment and try again.'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
export const clientAddress=(req:Request)=>req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
