import type { Database } from '~~/shared/types/database.types'

/** Cliente Supabase tipado + id del usuario actual (claims.sub) */
export function useDb() {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  // En @nuxtjs/supabase v2 el usuario son los claims del JWT: el id está en "sub"
  const userId = computed(() => user.value?.sub ?? null)
  return { client, user, userId }
}

/** URL pública de una foto del bucket gift-photos */
export function useGiftPhotoUrl() {
  const client = useSupabaseClient<Database>()
  return (path: string | null | undefined) =>
    path ? client.storage.from('gift-photos').getPublicUrl(path).data.publicUrl : null
}
