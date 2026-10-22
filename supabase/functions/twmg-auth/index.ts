import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const url=Deno.env.get('SUPABASE_URL')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{if(req.method!=='POST')return reply({error:'Method not allowed'},405);try{
 const raw=await req.text();if(raw.length>5000)return reply({error:'Request too large'},413);const body=JSON.parse(raw),password=body.password;
 if(typeof password!=='string'||password.length<1||password.length>200)return reply({error:'Invalid credentials'},400);
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 if(body.action==='username_login'){
  if(typeof body.username!=='string'||!/^[a-z0-9_]{3,30}$/.test(body.username))return reply({error:'Invalid username or password'},401);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.username)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const limit=await admin.rpc('allow_login',{bucket:hash});if(limit.error||!limit.data)return reply({error:'Too many attempts. Try again in 15 minutes.'},429);
  const resolved=await admin.rpc('resolve_login_email',{login_name:body.username});
  const result=await client.auth.signInWithPassword({email:resolved.data||'unknown-user@invalid.example',password});
  if(resolved.error||!resolved.data||result.error||!result.data.session)return reply({error:'Invalid username or password'},401);
  const {access_token,refresh_token}=result.data.session;return reply({access_token,refresh_token});
 }
 if(body.action==='delete_account'){
  const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Unauthorized'},401);
  const current=await admin.auth.getUser(token);if(current.error||!current.data.user?.email)return reply({error:'Unauthorized'},401);
  if(body.confirmation!=='DELETE ACCOUNT')return reply({error:'Type DELETE ACCOUNT to confirm'},400);
  const verified=await client.auth.signInWithPassword({email:current.data.user.email,password});if(verified.error||verified.data.user?.id!==current.data.user.id)return reply({error:'Re-authentication failed'},401);
  const revoked=await admin.auth.admin.signOut(token,'global');if(revoked.error)return reply({error:'Could not revoke sessions. Try again.'},400);
  const deleted=await admin.auth.admin.deleteUser(current.data.user.id);if(deleted.error)return reply({error:'Could not delete your account. Contact support.'},400);
  return reply({ok:true});
 }
 return reply({error:'Invalid action'},400);
 }catch{return reply({error:'Request failed'},400)}});
