import {sameOrigin} from '../../../lib/request-origin';
import {createClient} from '../../../lib/supabase/server';
import {z} from 'zod';
export const dynamic='force-dynamic';
const inputSchema=z.object({action:z.enum(['update','change_password','delete_profile','delete_account']),displayName:z.string().trim().min(1).max(60).optional(),username:z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/,'Use 3–30 letters, numbers or underscores.').optional(),email:z.string().trim().email().max(254).optional(),password:z.string().max(200).optional(),currentPassword:z.string().min(1).max(200).optional(),newPassword:z.string().min(8).max(200).optional(),profile:z.string().uuid().optional(),confirmation:z.string().optional()});
export async function POST(req:Request){try{
 if(!sameOrigin(req))return Response.json({error:'Invalid origin'},{status:403});
 const raw=await req.text();if(raw.length>5000)throw Error('Request too large');const input=inputSchema.parse(JSON.parse(raw)),db=await createClient();const {data:{user},error}=await db.auth.getUser();if(error||!user)return Response.json({error:'Unauthorized'},{status:401});
 if(input.action==='delete_account'){
 const session=await db.auth.getSession();const result=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/twmg-auth',{method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,Authorization:'Bearer '+session.data.session?.access_token},body:JSON.stringify({action:input.action,password:input.password,confirmation:input.confirmation})});const data=await result.json();if(!result.ok)return Response.json(data,{status:result.status});await db.auth.signOut();return Response.json({ok:true});
 }
 if(input.action==='change_password'){
  if(!input.currentPassword||!input.newPassword)throw Error('Enter your current and new password.');
  if(input.currentPassword===input.newPassword)throw Error('Your new password must be different.');
  if(!user.email)throw Error('A confirmed email address is required to change your password.');
  const verified=await db.auth.signInWithPassword({email:user.email,password:input.currentPassword});
  if(verified.error||verified.data.user?.id!==user.id)throw Error('Re-authentication failed. Check your password.');
  const updated=await db.auth.updateUser({password:input.newPassword});
  if(updated.error)throw Error(updated.error.message);
  return Response.json({ok:true,message:'Password updated successfully.'},{headers:{'Cache-Control':'no-store'}});
 }
 const current=await db.from('account_settings').select('*').eq('user_id',user.id).maybeSingle();if(current.error)throw Error('Could not load account settings.');
 const sensitive=input.action==='delete_profile'||(input.username!==undefined&&input.username!==current.data?.username)||(input.email!==undefined&&input.email!==user.email);
 if(sensitive){if(!input.password||!user.email)throw Error('Enter your current password to continue.');const verified=await db.auth.signInWithPassword({email:user.email,password:input.password});if(verified.error||verified.data.user?.id!==user.id)throw Error('Re-authentication failed. Check your password.');}
 if(input.action==='delete_profile'){
  if(!input.profile||input.confirmation!=='DELETE PROFILE')throw Error('Type DELETE PROFILE to confirm.');const owned=await db.from('profiles').select('id').eq('id',input.profile).eq('owner',user.id).maybeSingle();if(!owned.data)throw Error('Profile not found.');const result=await db.from('profiles').delete().eq('id',input.profile).eq('owner',user.id);if(result.error)throw Error('Could not delete the profile.');return Response.json({ok:true});
 }
 if(input.email&&input.email!==user.email){const updated=await db.auth.updateUser({email:input.email},{emailRedirectTo:new URL('/auth/callback',req.headers.get('origin')!).href});if(updated.error)throw Error(updated.error.message);}
 const values={user_id:user.id,username:input.username??current.data?.username??null,display_name:input.displayName??current.data?.display_name??''};
 const result=current.data?await db.from('account_settings').update({username:values.username,display_name:values.display_name}).eq('user_id',user.id):await db.from('account_settings').insert(values);if(result.error)throw Error(result.error.code==='23505'?'This login username is already taken.':'Could not save account settings.');
 return Response.json({ok:true,message:input.email&&input.email!==user.email?'Check your old and new inboxes to confirm the email change.':'Account settings saved.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join(' '):e instanceof Error?e.message:'Request failed'},{status:400})}}
