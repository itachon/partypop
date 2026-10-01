import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database.types'
import type { GuestGift } from '~~/shared/types/guest'

type Fns = Database['public']['Functions']
type GuestFn = Extract<keyof Fns, `guest_${string}`>

const TOKEN_RE = /^[0-9a-f]{32}$/

/**
 * Errores de las funciones guest_* → respuesta HTTP con texto amigable.
 * El código (statusMessage) lo puede usar el frontend para decidir qué mostrar.
 */
const GUEST_ERRORS: Record<string, { statusCode: number, message: string }> = {
  INVITATION_NOT_FOUND: { statusCode: 404, message: 'Esta invitación no existe o el link ya no es válido.' },
  DEADLINE_PASSED: { statusCode: 409, message: 'La fecha límite para responder ya pasó.' },
  INVALID_STATUS: { statusCode: 400, message: 'Respuesta no válida.' },
  INVALID_GUESTS: { statusCode: 400, message: 'La cantidad de asistentes no es válida para esta invitación.' },
  NOT_ACCEPTED: { statusCode: 409, message: 'Primero confirma tu asistencia para elegir un regalo.' },
  GIFT_NOT_FOUND: { statusCode: 404, message: 'Ese regalo no existe.' },
  GIFT_TAKEN: { statusCode: 409, message: 'Alguien acaba de apartar ese regalo. Elige otro.' },
}

/** Lee y valida el token de la URL sin tocar la base si el formato es inválido */
export function getGuestToken(event: H3Event): string {
  const token = getRouterParam(event, 'token') ?? ''
  if (!TOKEN_RE.test(token)) {
    throw createError({ statusCode: 404, statusMessage: 'INVITATION_NOT_FOUND', message: GUEST_ERRORS.INVITATION_NOT_FOUND!.message })
  }
  return token
}

/**
 * Llama a una función guest_* con la service key.
 * Es el ÚNICO camino por el que un invitado llega a la base de datos.
 */
export async function guestRpc<T, F extends GuestFn = GuestFn>(
  event: H3Event,
  fn: F,
  args: Fns[F]['Args'],
): Promise<T> {
  const client = serverSupabaseServiceRole<Database>(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.rpc as any)(fn, args)

  if (error) {
    const known = GUEST_ERRORS[error.message]
    if (known) {
      throw createError({ statusCode: known.statusCode, statusMessage: error.message, message: known.message })
    }
    console.error(`[${fn}]`, error)
    throw createError({ statusCode: 500, message: 'Ocurrió un error. Intenta nuevamente.' })
  }

  // Las respuestas de invitados nunca deben quedar en caché compartida
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return data as T
}

/** Agrega la URL pública de cada foto a la lista de regalos */
export function withPhotoUrls(event: H3Event, gifts: Omit<GuestGift, 'photo_url'>[]): GuestGift[] {
  const storage = serverSupabaseServiceRole<Database>(event).storage.from('gift-photos')
  return gifts.map(g => ({
    ...g,
    photo_url: g.photo_path ? storage.getPublicUrl(g.photo_path).data.publicUrl : null,
  }))
}
