import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5173';const auth=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});const cookie=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json',Accept:'application/json'};
const load=async(profile)=>{const r=await fetch(origin+'/api/finance'+(profile?'?profile='+profile:''),{headers});return await r.json()};
const initial=await load();const p=initial.profiles[0];const before=initial.data.transactions.length;
const save=async(profile,value)=>{const r=await fetch(origin+'/api/finance',{method:'PUT',headers,body:JSON.stringify({profile,action:'profile_update',value})});return {status:r.status,data:await r.json()}};
const payload={name:p.name,username:'profile_test_'+Date.now(),bio:'Personal profile integration test',avatar:'',emoji:'🌿',color:'#70528b',country:'Germany'};
let result=await save(p.id,payload);assert.equal(result.status,200);let after=await load(p.id);let saved=after.profiles.find(x=>x.id===p.id);assert.equal(saved.username,payload.username);assert.equal(saved.bio,payload.bio);assert.equal(saved.emoji,'🌿');assert.equal(saved.color,'#70528b');assert.equal(saved.currency,p.currency);assert.equal(after.data.transactions.length,before);
if(initial.profiles[1]){result=await save(initial.profiles[1].id,payload);assert.equal(result.status,400)}
result=await save('foreign-profile',payload);assert.equal(result.status,404);
result=await save(p.id,{...payload,avatar:'data:image/svg+xml;base64,PHN2Zz4='});assert.equal(result.status,400);
result=await save(p.id,{name:p.name,username:p.username||undefined,bio:p.bio||'',avatar:p.avatar||'',emoji:p.emoji||'',color:p.color||'#2d6048',country:p.country});assert.equal(result.status,200);
console.log('PASS: customization persists, unique handles, profile authorization, safe avatar types, unchanged financial records/currency');
