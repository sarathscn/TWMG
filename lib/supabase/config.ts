// Public Supabase connection for the TWMG project. Both values are meant to be
// public (they ship to every browser): the publishable key can only do what Row
// Level Security allows for the signed-in user. Environment variables override
// them, e.g. to point a local or preview build at a separate test project.
// Never put the secret/service_role key or the database password here.
export const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://sssqzcjvxydawjfpsziy.supabase.co';
export const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_QplECDKOh-I6ydTnsI6HxA_yDcMfqn4';
