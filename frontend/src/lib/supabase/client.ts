

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
   "https://owhtgsweeriugzrtzzws.supabase.co",
   "sb_publishable_gZydvbZwsSjxX8EgskdcFw_CYgULpYD"
  )
}