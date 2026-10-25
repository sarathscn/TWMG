import {createBrowserClient} from '@supabase/ssr';
import {supabaseUrl,supabaseKey} from './config';
export function createClient(){return createBrowserClient(supabaseUrl,supabaseKey)}
