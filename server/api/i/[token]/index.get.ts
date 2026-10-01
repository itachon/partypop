import type { GuestInvitationView } from '~~/shared/types/guest'

// GET /api/i/:token — datos de la invitación y la fiesta
export default defineEventHandler((event) => {
  const token = getGuestToken(event)
  return guestRpc<GuestInvitationView>(event, 'guest_get_invitation', { p_token: token })
})
