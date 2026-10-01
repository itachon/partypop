import type { GuestGift } from '~~/shared/types/guest'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/i/:token/gifts/:giftId — apartar (o cambiar a) este regalo
export default defineEventHandler(async (event) => {
  const token = getGuestToken(event)
  const giftId = getRouterParam(event, 'giftId') ?? ''
  if (!UUID_RE.test(giftId)) {
    throw createError({ statusCode: 404, statusMessage: 'GIFT_NOT_FOUND', message: 'Ese regalo no existe.' })
  }

  const gifts = await guestRpc<Omit<GuestGift, 'photo_url'>[]>(event, 'guest_reserve_gift', {
    p_token: token,
    p_gift_id: giftId,
  })
  return withPhotoUrls(event, gifts)
})
