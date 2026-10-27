import type {Data} from './finance.ts';
// Local-first data for the Android app. The server stays the source of truth; the device keeps
// (1) the last data it downloaded and (2) a queue of changes not yet uploaded. What the user sees
// is always server data with the queued changes applied on top, so an edit or delete shows at once
// and a queued delete can't "reappear" when fresh server data arrives.
export const offlineKinds=['accounts','transactions','budgets','goals','debts','shared','recurring','parties','categories','paymentMethods'] as const;
export type OfflineKind=typeof offlineKinds[number];
export type SyncOp={opId:string;user:string;profile:string;kind:OfflineKind;action:'save'|'delete';id:string;value?:Record<string,unknown>;base?:string|null;createdAt:number;state?:'pending'|'failed';error?:string;conflict?:boolean};
export type Changes={upserts:{id:string;kind:string;data:Record<string,unknown>}[];deletes:{id:string;kind?:string}[]};
export const isOfflineKind=(k:string):k is OfflineKind=>(offlineKinds as readonly string[]).includes(k);
const listOf=(data:Data,kind:string)=>((data as unknown as Record<string,{id:string}[]|undefined>)[kind]||[]);
function put(data:Data,kind:string,record:{id:string}){const list=listOf(data,kind);const i=list.findIndex(r=>r.id===record.id);const next=i<0?[...list,record]:list.map((r,j)=>j===i?record:r);return {...data,[kind]:next} as Data}
function drop(data:Data,kind:string|undefined,id:string){const out:Record<string,unknown>={...data};for(const k of kind?[kind]:offlineKinds){const list=listOf(data,k);if(list.some(r=>r.id===id))out[k]=list.filter(r=>r.id!==id)}return out as unknown as Data}
// Queued changes for this profile, in the order they were made.
export function applyOps(data:Data,ops:SyncOp[],profile:string):Data{
 let out=data;
 for(const op of [...ops].filter(o=>o.profile===profile).sort((a,b)=>a.createdAt-b.createdAt))out=op.action==='delete'?drop(out,op.kind,op.id):op.value?put(out,op.kind,{...op.value,id:op.id}):out;
 return out;
}
// Changes downloaded since the last version. Deleted records arrive as tombstones.
export function applyChanges(data:Data,changes:Changes):Data{
 let out=data;
 for(const u of changes.upserts)if(isOfflineKind(u.kind))out=put(out,u.kind,{...u.data,id:u.id});
 for(const d of changes.deletes)out=drop(out,d.kind&&isOfflineKind(d.kind)?d.kind:undefined,d.id);
 return out;
}
// Ask for a little more than strictly needed, so a write that committed just before the version
// was taken is never missed. Re-applying a change is harmless.
export function sinceFor(version?:string|null,overlapSeconds=120){if(!version||Number.isNaN(Date.parse(version)))return null;return new Date(Date.parse(version)-overlapSeconds*1000).toISOString()}
// Offline access to cached data is allowed only while the device still holds the sign-in session
// (it is removed on sign-out) and the account was confirmed online recently. Cached data alone
// never counts as being signed in.
export const offlineSessionDays=30;
export function offlineAllowed(cache:{user?:{id?:string};verifiedAt?:number}|null,hasSession:boolean,now=Date.now()){return !!cache?.user?.id&&hasSession&&!!cache.verifiedAt&&now-cache.verifiedAt<offlineSessionDays*864e5}
export type Snapshot={user:{id:string;name:string;email:string;username?:string;displayName?:string};profiles:unknown[];profile:string;data:Data;version:string|null;verifiedAt:number};
const key=(user:string)=>'twmg-cache:'+user;
export function readSnapshot(user:string):Snapshot|null{try{const v=JSON.parse(localStorage.getItem(key(user))||'null');return v?.user?.id===user&&v.data?v:null}catch{return null}}
export function writeSnapshot(s:Snapshot){try{localStorage.setItem(key(s.user.id),JSON.stringify(s));localStorage.setItem('twmg-last-user',s.user.id)}catch{/* storage full or blocked: the app still works online */}}
export function clearSnapshot(user:string){try{localStorage.removeItem(key(user));if(localStorage.getItem('twmg-last-user')===user)localStorage.removeItem('twmg-last-user')}catch{/* nothing stored */}}
export const lastUser=()=>{try{return localStorage.getItem('twmg-last-user')||''}catch{return ''}};
// Several downloads can be in flight at once (a background refresh after an upload, returning to
// the app, reconnecting, switching profile). A result is used only if no newer one was applied and
// it is for the profile the user is on now; change-only results merge only into that same profile's
// data. Anything else is dropped, or fetched in full, so a late reply can never switch profile or
// mix two profiles' records.
export function loadDecision(r:{seq:number;appliedSeq:number;wanted:string;got:string;incremental:boolean;baseProfile:string}):'apply'|'stale'|'full'{
 if(r.seq<r.appliedSeq)return 'stale';
 if(r.wanted&&r.got!==r.wanted)return 'stale';
 if(r.incremental&&r.got!==r.baseProfile)return 'full';
 return 'apply';
}
