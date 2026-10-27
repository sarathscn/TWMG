import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareVersions,parseVersion,updateStatus,readAppVersion} from '../lib/version.ts';
import {applyOps,applyChanges,sinceFor,offlineAllowed,loadDecision,type SyncOp} from '../lib/offline-sync.ts';
import type {Data} from '../lib/finance.ts';

test('Versions compare as numbers, never as text',()=>{
 assert.equal(compareVersions('1.10.0','1.9.0'),1,'1.10 is newer than 1.9');
 assert.equal(compareVersions('1.4.2','1.5.0'),-1);
 assert.equal(compareVersions('v2.0','2.0.0'),0);
 assert.equal(compareVersions('1.8.0-beta','1.8.0'),0,'suffixes are ignored');
 for(const bad of ['', 'latest', '1.x', null, undefined, 12])assert.equal(compareVersions(bad as any,'1.0.0'),null);
 assert.deepEqual(parseVersion(' 3.2 '),[3,2,0]);
});
test('Update status covers update, current, newer and unknown versions',()=>{
 assert.equal(updateStatus({versionName:'1.4.2'},{versionName:'1.5.0'}),'update-available');
 assert.equal(updateStatus({versionName:'1.8.0',versionCode:13},{versionName:'1.8.0',versionCode:13}),'up-to-date');
 assert.equal(updateStatus({versionName:'1.9.0'},{versionName:'1.8.0'}),'newer-than-latest','a newer install is not told to update');
 assert.equal(updateStatus({versionName:'1.8.0',versionCode:12},{versionName:'1.8.0',versionCode:13}),'update-available','same name, newer build');
 assert.equal(updateStatus({versionName:'1.8.0'},null),'unknown');
 assert.equal(updateStatus({versionName:'nonsense'},{versionName:'1.0.0'}),'unknown');
 assert.deepEqual(readAppVersion({versionName:'1.8.0',versionCode:'13'}),{versionName:'1.8.0',versionCode:13});
 assert.equal(readAppVersion({versionName:'oops'}),null);assert.equal(readAppVersion('1.8.0'),null);
});
test('The latest version and the build read the same release file',()=>{
 const release=JSON.parse(readFileSync('android-release.json','utf8'));
 assert.ok(parseVersion(release.versionName)&&Number.isSafeInteger(release.versionCode));
 const gradle=readFileSync('android/app/build.gradle.kts','utf8');
 assert.match(gradle,/JsonSlurper\(\)\.parse\(rootProject\.file\("\.\.\/android-release\.json"\)\)/);
 assert.match(gradle,/versionName = release\["versionName"\] as String/);
 assert.ok(!/versionName = "\d/.test(gradle),'no hard-coded versionName');
 assert.match(readFileSync('app/api/app-version/route.ts','utf8'),/android-release\.json/);
});
test('Version details render only inside the Android app, not on the website',()=>{
 const app=readFileSync('app/ui/FinanceApp.tsx','utf8');
 assert.match(app,/\{localFirst && <AndroidVersionPanel\/>\}/,'About shows the panel only in the Android app');
 assert.match(app,/if \(!isAndroidApp\(\)\) \{ load\(\); return; \}/,'the website keeps its online-only start');
 assert.match(readFileSync('app/ui/DeviceSecurity.tsx','utf8'),/export const isAndroidApp = \(\) => typeof bridge\(\)\?\.queueAdd === 'function'/);
 assert.ok(!/installedVersion|Latest available version/.test(app.replace(/AndroidVersionPanel/g,'')),'no version-check markup in the shared page');
});

const empty=():Data=>({accounts:[],transactions:[],budgets:[],goals:[],debts:[],shared:[],recurring:[],parties:[],categories:[],paymentMethods:[]});
const tx=(id:string,amount=100)=>({id,name:id,type:'expense' as const,amount,account:'bank',category:'Food',date:'2026-10-27'});
const op=(n:number,action:'save'|'delete',id:string,value?:Record<string,unknown>,profile='p1'):SyncOp=>({opId:'op'+n,user:'u1',profile,kind:'transactions',action,id,value,createdAt:n});
test('Offline edits and deletes show at once on top of the server copy',()=>{
 const server={...empty(),transactions:[tx('a'),tx('b')]};
 const shown=applyOps(server,[op(1,'save','a',{...tx('a'),amount:999}),op(2,'save','c',tx('c')),op(3,'delete','b')],'p1');
 assert.deepEqual(shown.transactions.map(t=>[t.id,t.amount]),[['a',999],['c',100]]);
 assert.equal(server.transactions.length,2,'the server copy itself is untouched');
 assert.deepEqual(applyOps(server,[op(1,'save','a',tx('a',5),'p2')],'p1').transactions.map(t=>t.amount),[100,100],'other profiles are not mixed in');
 // Later changes win, in the order they were made.
 assert.equal(applyOps(server,[op(2,'save','a',tx('a',2)),op(1,'save','a',tx('a',1))],'p1').transactions[0].amount,2);
});
test('A queued delete does not reappear when fresh server data still has the record',()=>{
 const fresh={...empty(),transactions:[tx('gone'),tx('kept')]};
 assert.deepEqual(applyOps(fresh,[op(1,'delete','gone')],'p1').transactions.map(t=>t.id),['kept']);
});
test('Incremental downloads apply updates and tombstones',()=>{
 const local={...empty(),transactions:[tx('a'),tx('b')]};
 const next=applyChanges(local,{upserts:[{id:'a',kind:'transactions',data:{...tx('a'),amount:7}},{id:'n',kind:'transactions',data:tx('n')}],deletes:[{id:'b',kind:'transactions'},{id:'unknown'}]});
 assert.deepEqual(next.transactions.map(t=>[t.id,t.amount]),[['a',7],['n',100]]);
 assert.deepEqual(applyChanges(next,{upserts:[{id:'n',kind:'transactions',data:tx('n')}],deletes:[]}).transactions.length,2,'re-applying the same change is harmless');
 assert.equal(sinceFor('2026-10-27T10:02:00.000Z'),'2026-10-27T10:00:00.000Z','asks for a little overlap');
 assert.equal(sinceFor(null),null);assert.equal(sinceFor('soon'),null);
});
test('Cached data opens offline only with a live session that was confirmed recently',()=>{
 const now=Date.parse('2026-10-27T00:00:00Z'),cache={user:{id:'u1'},verifiedAt:now-5*864e5};
 assert.equal(offlineAllowed(cache,true,now),true);
 assert.equal(offlineAllowed(cache,false,now),false,'signed out: cached data alone never counts');
 assert.equal(offlineAllowed({...cache,verifiedAt:now-31*864e5},true,now),false,'too long since the account was confirmed online');
 assert.equal(offlineAllowed(null,true,now),false);
});
test('The server checks offline edits against newer changes and supports change-only downloads',()=>{
 const api=readFileSync('app/api/finance/route.ts','utf8');
 assert.match(api,/\.gt\('created',body\.base\)/,'a record changed after the device last saw it is a conflict');
 assert.match(api,/status:409/);
 assert.match(api,/sameData\(cur\.data\.data/,'a retried write that already landed is not a conflict');
 assert.match(api,/deletes:ids\.filter\(x=>!present\.has\(x\)\)/,'deleted records are reported as tombstones');
 assert.match(api,/Promise\.all\(\[db\.from\('account_settings'\)/,'independent queries run together');
});
test('The Android stand-in used for testing ships only in development builds',()=>{
 const layout=readFileSync('app/layout.tsx','utf8');
 assert.match(layout,/process\.env\.NODE_ENV==='development'&&<script dangerouslySetInnerHTML=\{\{__html:devAndroidStub\}\}\/>/);
 const app=readFileSync('app/ui/FinanceApp.tsx','utf8');
 assert.match(app,/if \(process\.env\.NODE_ENV === 'production'\) navigator\.serviceWorker\?\.register\('\/sw\.js'\)/,'the offline shell registers only in production, only in the Android app');
 const sw=readFileSync('public/sw.js','utf8');
 assert.ok(sw.includes("const NEVER = [/^\\/api\\//"),'finance API responses are never cached by the service worker');
});
test('A late download can never switch profile or mix two profiles',()=>{
 const base={seq:5,appliedSeq:4,wanted:'B',got:'B',incremental:false,baseProfile:'A'};
 assert.equal(loadDecision(base),'apply','the newest download for the profile on screen is used');
 assert.equal(loadDecision({...base,got:'A'}),'stale','a background refresh of the old profile, finishing after a switch, is dropped');
 assert.equal(loadDecision({...base,seq:3}),'stale','an older download finishing late is dropped');
 assert.equal(loadDecision({...base,incremental:true}),'full','changes for B are never merged into A’s records');
 assert.equal(loadDecision({...base,incremental:true,baseProfile:'B'}),'apply');
 assert.equal(loadDecision({...base,wanted:''}),'apply','first launch accepts the server’s profile');
 const app=readFileSync('app/ui/FinanceApp.tsx','utf8');
 assert.match(app,/profile: serverProfile\.current, kind, action/,'a saved change belongs to the profile whose data is on screen');
 assert.match(app,/async function switchTo\(id: string\) \{\n\s*wantProfile\.current = id;/);
});
test('About shows no version on the website; the Android check sits in its side column',()=>{
 const app=readFileSync('app/ui/FinanceApp.tsx','utf8');
 assert.ok(!/appVersion|packageJson/.test(app),'the web package version is not shown');
 assert.match(app,/<aside className="about-side">.*\{localFirst && <AndroidVersionPanel\/>\}<\/aside>/);
});
