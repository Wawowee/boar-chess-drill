import { createClient } from '@supabase/supabase-js'

export const supabase =
  typeof window === 'undefined'
    ? (null as any)
    : createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
