import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mvbgtzofohhwhhnjqvvg.supabase.co'
const supabaseAnonKey = 'sb_publishable_peLMIIKIxRwtnUQrANQP-A_blz7vAth'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
