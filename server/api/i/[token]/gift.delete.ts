import type { GuestGift } from '~~/shared/types/guest'

// DELETE /api/i/:token/gift — liberar el regalo que apartó este invitado
export default defineEventHandler(async (event) => {
  const token = getGuestToken(event)
  const gifts = await guestRpc<Omit<GuestGift, 'photo_url'>[]>(event, 'guest_release_gift', { p_token: token })
  return withPhotoUrls(event, gifts)
})
