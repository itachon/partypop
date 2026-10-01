// Traduce errores de Supabase / Postgres / API a mensajes para el usuario

interface MaybeError {
  message?: string
  code?: string
  data?: { message?: string }
  statusMessage?: string
}

const CONSTRAINTS: Record<string, string> = {
  rsvp_before_event: 'La fecha límite para confirmar debe ser anterior o igual a la fecha del evento.',
  confirmed_guests_valid: 'No puedes dejar el cupo por debajo de las personas que ya confirmaron.',
  invitations_max_guests_check: 'El cupo debe estar entre 1 y 50 personas.',
}

const AUTH: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.',
  'User already registered': 'Ya existe una cuenta con ese correo.',
}

export function errorMessage(err: unknown, fallback = 'Ocurrió un error. Intenta nuevamente.'): string {
  if (!err) return fallback
  const e = err as MaybeError

  // Respuestas de nuestra API (/api/i/...) vía $fetch
  if (e.data?.message) return e.data.message

  const msg = e.message ?? ''
  for (const [key, text] of Object.entries(CONSTRAINTS)) {
    if (msg.includes(key)) return text
  }
  if (AUTH[msg]) return AUTH[msg]
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera un momento y vuelve a intentar.'

  // Mensajes propios lanzados desde funciones SQL (ya vienen en español)
  if (e.code === '42501' || e.code === 'P0001' || e.code === 'P0002') return msg

  return msg || fallback
}
