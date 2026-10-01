// Forma de los datos que reciben los invitados desde /api/i/[token]/*
// (lo que devuelven las funciones guest_* de la base de datos)

export type InvitationStatus = 'pending' | 'accepted' | 'declined'

export interface GuestInvitationView {
  invitation: {
    guest_name: string
    max_guests: number
    is_group: boolean
    status: InvitationStatus
    confirmed_guests: number | null
    responded_at: string | null
  }
  party: {
    name: string
    description: string | null
    location: string | null
    event_at: string
    rsvp_deadline: string
  }
  /** false cuando ya pasó la fecha límite: todo queda en solo lectura */
  is_open: boolean
  has_gifts: boolean
  my_gift_id: string | null
}

export interface GuestGift {
  id: string
  name: string
  description: string | null
  photo_path: string | null
  /** URL pública de la foto (la arma el servidor) */
  photo_url: string | null
  purchase_url: string | null
  /** alguien lo apartó (nunca se dice quién) */
  reserved: boolean
  /** lo apartó este invitado */
  mine: boolean
}
