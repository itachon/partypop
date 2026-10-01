import type { Tables } from '~~/shared/types/database.types'

export type Party = Tables<'parties'>
export type Invitation = Tables<'invitations'>
export type Gift = Tables<'gifts'>
export type Reservation = Tables<'gift_reservations'>
export interface PartyAdminRow {
  user_id: string
  created_at: string
  profile: { email: string, full_name: string | null } | null
}
export interface OwnerProfile { email: string, full_name: string | null }

/**
 * Todos los datos de una fiesta para el panel de administración.
 * Se cargan juntos para que el resumen, las invitaciones y los regalos
 * siempre muestren la misma información.
 */
export async function usePartyAdmin(partyId: string) {
  const { client, userId } = useDb()

  const { data, error, refresh, status } = await useAsyncData(`party-admin-${partyId}`, async () => {
    const [party, invitations, gifts, reservations, admins] = await Promise.all([
      client.from('parties')
        .select('*, owner:profiles!parties_owner_id_fkey(email, full_name)')
        .eq('id', partyId)
        .maybeSingle(),
      client.from('invitations').select('*').eq('party_id', partyId).order('created_at'),
      client.from('gifts').select('*').eq('party_id', partyId).order('sort_order').order('created_at'),
      client.from('gift_reservations').select('*').eq('party_id', partyId),
      client.from('party_admins')
        .select('user_id, created_at, profile:profiles!party_admins_user_id_fkey(email, full_name)')
        .eq('party_id', partyId)
        .order('created_at'),
    ])

    for (const r of [party, invitations, gifts, reservations, admins]) {
      if (r.error) throw r.error
    }

    const p = party.data as unknown as (Party & { owner: OwnerProfile | null }) | null
    return {
      party: p,
      invitations: (invitations.data ?? []) as Invitation[],
      gifts: (gifts.data ?? []) as Gift[],
      reservations: (reservations.data ?? []) as Reservation[],
      admins: (admins.data ?? []) as unknown as PartyAdminRow[],
    }
  })

  const party = computed(() => data.value?.party ?? null)
  const invitations = computed(() => data.value?.invitations ?? [])
  const gifts = computed(() => data.value?.gifts ?? [])
  const reservations = computed(() => data.value?.reservations ?? [])
  const admins = computed(() => data.value?.admins ?? [])
  const isOwner = computed(() => !!party.value && party.value.owner_id === userId.value)

  /** gift_id → invitación que lo apartó */
  const reservationByGift = computed(() => {
    const invById = new Map(invitations.value.map(i => [i.id, i]))
    const map = new Map<string, Invitation>()
    for (const r of reservations.value) {
      const inv = invById.get(r.invitation_id)
      if (inv) map.set(r.gift_id, inv)
    }
    return map
  })

  /** invitation_id → regalo apartado */
  const giftByInvitation = computed(() => {
    const giftById = new Map(gifts.value.map(g => [g.id, g]))
    const map = new Map<string, Gift>()
    for (const r of reservations.value) {
      const g = giftById.get(r.gift_id)
      if (g) map.set(r.invitation_id, g)
    }
    return map
  })

  const stats = computed(() => {
    const inv = invitations.value
    const accepted = inv.filter(i => i.status === 'accepted')
    return {
      invitations: inv.length,
      accepted: accepted.length,
      declined: inv.filter(i => i.status === 'declined').length,
      pending: inv.filter(i => i.status === 'pending').length,
      // personas
      invitedPeople: inv.reduce((s, i) => s + i.max_guests, 0),
      confirmedPeople: accepted.reduce((s, i) => s + (i.confirmed_guests ?? 0), 0),
      gifts: gifts.value.length,
      giftsReserved: reservations.value.length,
    }
  })

  const isClosed = computed(() => !!party.value && new Date(party.value.rsvp_deadline) < new Date())

  return {
    data, error, status, refresh,
    party, invitations, gifts, reservations, admins,
    isOwner, isClosed, stats, reservationByGift, giftByInvitation,
  }
}

export type PartyAdminContext = Awaited<ReturnType<typeof usePartyAdmin>>
