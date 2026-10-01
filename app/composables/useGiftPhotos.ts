/** Subida y limpieza de fotos de regalos en el bucket gift-photos */
export function useGiftPhotos() {
  const { client } = useDb()
  const bucket = () => client.storage.from('gift-photos')

  async function upload(partyId: string, blob: Blob): Promise<string> {
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${partyId}/${crypto.randomUUID()}.${ext}`
    const { error } = await bucket().upload(path, blob, {
      contentType: blob.type,
      cacheControl: '31536000', // el nombre es único: se puede cachear para siempre
      upsert: false,
    })
    if (error) throw error
    return path
  }

  /** Borra la foto solo si ningún regalo la usa (los duplicados comparten foto) */
  async function removeIfUnused(path: string | null | undefined) {
    if (!path) return
    const { count } = await client.from('gifts')
      .select('id', { count: 'exact', head: true })
      .eq('photo_path', path)
    if (!count) await bucket().remove([path])
  }

  return { upload, removeIfUnused }
}
