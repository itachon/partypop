import type { GuestInvitationView } from '~~/shared/types/guest'

// POST /api/i/:token/rsvp — aceptar o declinar
// body: { status: 'accepted' | 'declined', confirmed_guests?: number }
export default defineEventHandler(async (event) => {
  const token = getGuestToken(event)
  const body = await readBody<{ status?: unknown, confirmed_guests?: unknown }>(event)

  const status = body?.status
  if (status !== 'accepted' && status !== 'declined') {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_STATUS', message: 'Respuesta no válida.' })
  }

  const guests = body?.confirmed_guests
  const confirmedGuests = Number.isInteger(guests) ? (guests as number) : null

  return guestRpc<GuestInvitationView>(event, 'guest_respond', {
    p_token: token,
    p_status: status,
    p_confirmed_guests: confirmedGuests,
  })
})
