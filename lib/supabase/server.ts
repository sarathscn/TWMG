import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {supabaseUrl,supabaseKey} from './config';
export async function createClient(){
 const store=await cookies();
 return createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>store.getAll(),setAll:items=>{items.forEach(({name,value,options})=>store.set(name,value,options))}}});
}
