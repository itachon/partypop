import type { GuestGift } from '~~/shared/types/guest'

// GET /api/i/:token/gifts — lista de regalos (apartados sin nombre)
export default defineEventHandler(async (event) => {
  const token = getGuestToken(event)
  const gifts = await guestRpc<Omit<GuestGift, 'photo_url'>[]>(event, 'guest_list_gifts', { p_token: token })
  return withPhotoUrls(event, gifts)
})
