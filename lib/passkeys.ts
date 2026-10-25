import {supabaseUrl,supabaseKey} from './supabase/config';
// Passkeys (WebAuthn) are handled entirely by Supabase Auth and the device: the browser or
// phone verifies the fingerprint/face/PIN and only a public-key credential reaches Supabase.
// They appear only when this browser supports WebAuthn and the Supabase project enables them.
let available:Promise<boolean>|undefined;
export function passkeysAvailable(){
 if(typeof window==='undefined'||!('PublicKeyCredential' in window))return Promise.resolve(false);
 return available??=fetch(supabaseUrl+'/auth/v1/settings',{headers:{apikey:supabaseKey}}).then(r=>r.ok?r.json():{}).then((s:{passkeys_enabled?:boolean})=>!!s.passkeys_enabled).catch(()=>false);
}
// Turns WebAuthn/Supabase errors into a short message; cancelling the prompt is not an error.
export function passkeyMessage(error:unknown){
 const e=error as {name?:string;code?:string;message?:string};
 if(e?.name==='NotAllowedError'||e?.code==='ERROR_CEREMONY_ABORTED'||/cancel|abort|not allowed/i.test(e?.message||''))return '';
 if(e?.code==='webauthn_challenge_expired')return 'The passkey request expired. Please try again.';
 return e?.message||'Passkey sign-in failed. Use your password instead.';
}
