import type { InjectionKey } from 'vue'
import type { PartyAdminContext } from './usePartyAdmin'

const KEY: InjectionKey<PartyAdminContext> = Symbol('party-admin-ctx')

export function providePartyCtx(ctx: PartyAdminContext) {
  provide(KEY, ctx)
}

/** Datos de la fiesta abierta en el panel (lo provee la página /admin/fiestas/[id]) */
export function usePartyCtx(): PartyAdminContext {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('usePartyCtx() fuera de la página de la fiesta')
  return ctx
}
