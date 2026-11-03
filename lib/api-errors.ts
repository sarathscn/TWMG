// How the API talks about failures. A problem the person can fix keeps its message; an outage says so in
// plain words with a 503, so the app keeps the session and the device copy, and queued changes retry
// instead of being marked as refused. Database details stay in the server log.
export class ServiceError extends Error {
 status=503;
 constructor(message='TWMG is temporarily unavailable. Your data is safe. Please try again shortly.'){super(message);this.name='ServiceError'}
}
type DbError={message:string;code?:string};
// Rule failures: messages raised by this app's own triggers read fine; built-in constraint text names tables.
const ruleCodes=new Set(['P0001','23514','23505','23503']);
const schemaText=/violates|constraint|relation |column |duplicate key/i;
export function databaseFailure(error:DbError):Error{
 if(error.code==='42501')return Error('You do not have access to this record.');
 if(ruleCodes.has(error.code||''))return Error(schemaText.test(error.message)?'This change breaks a data rule and was not saved.':error.message);
 return new ServiceError();
}
// A signed-out request and an auth service that can't be reached look alike unless told apart, and
// treating an outage as signed out would end everyone's session.
export function isAuthOutage(error:{name?:string;status?:number}|null|undefined){
 return !!error&&(error.name==='AuthRetryableFetchError'||(typeof error.status==='number'&&(error.status>=500||error.status===0)));
}
// Reads every row: PostgREST caps one response (1000 rows by default), so a single query would quietly
// drop the rest and every balance built from them. Callers must order by a unique column.
export async function fetchAll<T>(page:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:DbError|null}>,size=1000):Promise<T[]>{
 const rows:T[]=[];
 for(let from=0;;from+=size){
  const {data,error}=await page(from,from+size-1);
  if(error)throw databaseFailure(error);
  rows.push(...(data||[]));
  if(!data||data.length<size)return rows;
 }
}
