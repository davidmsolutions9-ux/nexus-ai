import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
if (!supabaseKey) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set')

// Singleton — safe to import anywhere in the Fastify process
export const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
  auth: {
    // Server-side: disable automatic session persistence
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
