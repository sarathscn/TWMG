import {sameOrigin} from '../../lib/request-origin';
import {createClient} from '../../lib/supabase/server';
export async function POST(request:Request){if(!sameOrigin(request))return new Response('Invalid origin',{status:403});const client=await createClient();await client.auth.signOut();return Response.json({ok:true})}
