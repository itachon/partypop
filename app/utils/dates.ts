// Fechas: siempre en la zona horaria de la app (config public.timeZone,
// por defecto America/Santiago). Así el servidor (que en producción suele
// estar en UTC) y el navegador muestran exactamente la misma hora, y no hay
// errores de hidratación. La fiesta ocurre en un lugar: su hora no debe
// cambiar según desde dónde se mire.

let TZ = 'America/Santiago'

/** La fija el plugin plugins/time-zone.ts al iniciar */
export function setAppTimeZone(tz: string) {
  if (tz) TZ = tz
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(key: string, opts: Intl.DateTimeFormatOptions, locale = 'es-CL') {
  const k = `${TZ}|${locale}|${key}`
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: TZ })
    fmtCache.set(k, f)
  }
  return f
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Sábado, 24 de octubre de 2026, 16:00" (inline = sin mayúscula, para usar a media frase) */
export function formatLongDate(iso: string | null | undefined, inline = false): string {
  if (!iso) return ''
  const s = fmt('long', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  return inline ? s : cap(s)
}

/** "24 oct 2026, 16:00" */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return fmt('short', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** "Sábado, 24 de octubre" */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return ''
  return cap(fmt('day', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)))
}

/** "16:00" */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return fmt('time', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** Diferencia (ms) entre la hora local de TZ y UTC en ese instante */
function tzOffset(date: Date): number {
  const parts = fmt('parts', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }, 'en-US').formatToParts(date)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** ISO → valor para <input type="datetime-local"> (en la zona de la app) */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const local = new Date(d.getTime() + tzOffset(d))
  return local.toISOString().slice(0, 16)
}

/** Valor de <input type="datetime-local"> (zona de la app) → ISO UTC */
export function fromLocalInput(value: string): string {
  const [date = '', time = '00:00'] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!)
  let t = guess - tzOffset(new Date(guess))
  const off2 = tzOffset(new Date(t))
  if (guess - off2 !== t) t = guess - off2 // ajuste en cambios de horario
  return new Date(t).toISOString()
}

/** "en 3 días" / "hoy" / "mañana" / "ya pasó" (según el calendario de TZ) */
export function relativeDays(iso: string): string {
  const target = new Date(iso)
  if (target.getTime() < Date.now()) return 'ya pasó'
  const dayKey = (d: Date) => {
    const local = new Date(d.getTime() + tzOffset(d))
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  }
  const days = Math.round((dayKey(target) - dayKey(new Date())) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}
