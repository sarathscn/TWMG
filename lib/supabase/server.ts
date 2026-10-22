import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export async function createClient(){
 const store=await cookies();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw Error('Supabase is not configured.');
 return createServerClient(url,key,{cookies:{getAll:()=>store.getAll(),setAll:items=>{items.forEach(({name,value,options})=>store.set(name,value,options))}}});
}
