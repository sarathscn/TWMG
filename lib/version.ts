// Android app versions ("1.8.0", optionally with a build number) compared numerically, part by
// part, never as text: "1.10.0" is newer than "1.9.0".
export type AppVersion={versionName:string;versionCode?:number};
export type UpdateStatus='update-available'|'up-to-date'|'newer-than-latest'|'unknown';
export function parseVersion(v:unknown):number[]|null{
 if(typeof v!=='string')return null;
 const m=v.trim().replace(/^v/i,'').match(/^(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?(?:[-+].*)?$/);
 return m?[Number(m[1]),Number(m[2]||0),Number(m[3]||0)]:null;
}
// -1 when a is older, 1 when newer, 0 when equal, null when either can't be read.
export function compareVersions(a:unknown,b:unknown):-1|0|1|null{
 const x=parseVersion(a),y=parseVersion(b);if(!x||!y)return null;
 for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;
 return 0;
}
const code=(v?:number)=>Number.isSafeInteger(v)&&v!>0?v!:undefined;
// Same version name: the build number decides (a rebuilt release with a higher code is newer).
export function updateStatus(installed?:AppVersion|null,latest?:AppVersion|null):UpdateStatus{
 if(!installed||!latest)return 'unknown';
 const byName=compareVersions(installed.versionName,latest.versionName);
 if(byName===null)return 'unknown';
 if(byName<0)return 'update-available';
 if(byName>0)return 'newer-than-latest';
 const a=code(installed.versionCode),b=code(latest.versionCode);
 if(a!==undefined&&b!==undefined&&a!==b)return a<b?'update-available':'newer-than-latest';
 return 'up-to-date';
}
export function readAppVersion(raw:unknown):AppVersion|null{
 if(!raw||typeof raw!=='object')return null;
 const v=raw as Record<string,unknown>;
 if(typeof v.versionName!=='string'||!parseVersion(v.versionName))return null;
 const c=typeof v.versionCode==='number'?v.versionCode:Number(v.versionCode);
 return {versionName:v.versionName.trim(),...(Number.isSafeInteger(c)&&c>0?{versionCode:c}:{})};
}
