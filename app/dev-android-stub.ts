// Development only (never included in production builds; see app/layout.tsx): a stand-in for the
// Android bridge and the finance API, so the app's local-first mode can be exercised in a desktop
// browser. Turn it on with localStorage 'twmg-dev-android' = '1'. Control it from the console:
//   __stub.online(false)  simulate no connection      __stub.flush()  run the upload queue
//   __stub.server()       the fake server's records   __stub.conflict(id)  next upload of id conflicts
export const devAndroidStub = `(function(){try{if(localStorage.getItem('twmg-dev-android')!=='1')return;}catch(e){return;}
var Q='stub-queue',S='stub-server',ls=localStorage,get=function(k,d){try{return JSON.parse(ls.getItem(k))||d}catch(e){return d}},set=function(k,v){ls.setItem(k,JSON.stringify(v))};
var online=ls.getItem('stub-offline')!=='1',state='idle',conflicts={},clock=Date.now();
function now(){clock=Math.max(clock+1,Date.now());return new Date(clock).toISOString()}
function server(){return get(S,{user:{id:'dev-user',name:'Dev',email:'dev@example.com'},profiles:[{id:'p1',name:'Personal',country:'India',currency:'INR'}],records:{},history:[]})}
function emit(){var mine=get(Q,[]);window.dispatchEvent(new CustomEvent('twmg-native',{detail:{type:'sync',data:{state:state,pending:mine.filter(function(o){return o.state!=='failed'}).length,failed:mine.filter(function(o){return o.state==='failed'}).length,lastSync:Date.now()}}}))}
function put(body){var s=server(),id=body.action==='delete'?body.id:body.value.id,cur=s.records[id];
 if(body.base&&cur&&(conflicts[id]||s.history.some(function(h){return h.record===id&&h.created>body.base}))){delete conflicts[id];return {status:409,json:{error:'This record was changed on another device after your offline edit. Review it and try again.',conflict:true}}}
 var at=now();if(body.action==='delete'){delete s.records[id]}else{s.records[id]={kind:body.kind,data:body.value}}s.history.push({record:id,kind:body.kind,created:at});set(S,s);return {status:200,json:{ok:true,touched:[{id:id,at:at}]}}}
function flush(){if(!online){state='offline';emit();return}state='syncing';emit();setTimeout(function(){var q=get(Q,[]);while(q.length&&q[0].state!=='failed'){var r=put(q[0]);if(r.status===200){var t=r.json.touched[0];q.shift();q.forEach(function(o){if(o.id===t.id&&o.base&&o.base<t.at)o.base=t.at})}else{q[0].state='failed';q[0].error=r.json.error;q[0].conflict=r.status===409;set(Q,q);state='failed';emit();return}}set(Q,q);state='idle';emit()},300)}
window.TWMGAndroid={queueAdd:function(j){var o=JSON.parse(j),q=get(Q,[]);if(!q.some(function(x){return x.opId===o.opId})){o.state='pending';q.push(o);set(Q,q)}setTimeout(flush,50);return true},
 queueList:function(u){return JSON.stringify(get(Q,[]).filter(function(o){return o.user===u}))},queueDiscard:function(id){set(Q,get(Q,[]).filter(function(o){return o.opId!==id}));emit()},
 queueRetry:function(id,keep){var q=get(Q,[]);q.forEach(function(o){if(o.opId===id){o.state='pending';delete o.error;if(keep)delete o.base}});set(Q,q);flush()},syncNow:function(){flush()},
 syncStatus:function(){return JSON.stringify({state:state,pending:get(Q,[]).length,failed:0})},setSyncUser:function(){},clearLocal:function(u){set(Q,get(Q,[]).filter(function(o){return o.user!==u}))},
 hasSession:function(){return ls.getItem('stub-session')!=='0'},appVersion:function(){return JSON.stringify({versionName:ls.getItem('stub-version')||'1.7.4',versionCode:12})},
 appLockAvailable:function(){return false},appLockEnabled:function(){return false},setAppLockEnabled:function(){},remindersEnabled:function(){return false},setRemindersEnabled:function(){},syncReminders:function(){},saveFile:function(){}};
var realFetch=window.fetch.bind(window);
window.fetch=function(input,init){var url=typeof input==='string'?input:input.url;var p=new URL(url,location.href);
 if(p.pathname==='/api/finance'&&(!init||!init.method||init.method==='GET')){window.__stubGets=(window.__stubGets||[]).concat([p.search]);if(!online)return Promise.reject(new TypeError('Failed to fetch'));if(ls.getItem('stub-session')==='0')return Promise.resolve(new Response(JSON.stringify({error:'Unauthorized'}),{status:401}));var s=server(),since=p.searchParams.get('since'),version=s.history.reduce(function(m,h){return h.created>m?h.created:m},'')||null;
  var data={accounts:[],transactions:[],budgets:[],goals:[],debts:[],shared:[],recurring:[],parties:[],categories:[],paymentMethods:[]};Object.keys(s.records).forEach(function(id){var r=s.records[id];(data[r.kind]=data[r.kind]||[]).push(r.data)});
  var body={profiles:s.profiles,profile:'p1',user:s.user,version:version};if(since){var ids={};s.history.filter(function(h){return h.created>since}).forEach(function(h){ids[h.record]=h.kind});body.changes={upserts:Object.keys(ids).filter(function(i){return s.records[i]}).map(function(i){return {id:i,kind:s.records[i].kind,data:s.records[i].data}}),deletes:Object.keys(ids).filter(function(i){return !s.records[i]}).map(function(i){return {id:i,kind:ids[i]}})}}else body.data=data;
  return new Promise(function(res){setTimeout(function(){res(new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}}))},150)})}
 if(p.pathname==='/api/app-version'){if(!online)return Promise.reject(new TypeError('Failed to fetch'));return Promise.resolve(new Response(JSON.stringify({android:{versionName:'1.8.0',versionCode:13}}),{status:200}))}
 if(p.pathname==='/logout')return Promise.resolve(new Response('{"ok":true}',{status:200}));
 return realFetch(input,init)};
window.__stub={online:function(v){online=v;ls.setItem('stub-offline',v?'0':'1');if(v)flush()},flush:flush,server:server,conflict:function(id){conflicts[id]=true},edit:function(id,data){var s=server();s.records[id]={kind:s.records[id].kind,data:data};s.history.push({record:id,kind:s.records[id].kind,created:now()});set(S,s)}};
})();`;
