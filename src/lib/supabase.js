import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ikamfqbfzxyhzkupstgc.supabase.co'

const supabaseKey = 'sb_publishable_xxxxxxxxxxxxx'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)