<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database.types'

type Invitation = Tables<'invitations'>

const { party, invitations, giftByInvitation, stats, refresh } = usePartyCtx()
const { client } = useDb()
const toast = useToast()
const inviteUrl = useInvitationUrl()

const search = ref('')
const filter = ref<'all' | 'pending' | 'accepted' | 'declined'>('all')

const filterItems = computed(() => [
  { label: `Todas (${stats.value.invitations})`, value: 'all' },
  { label: `Pendientes (${stats.value.pending})`, value: 'pending' },
  { label: `Asisten (${stats.value.accepted})`, value: 'accepted' },
  { label: `No asisten (${stats.value.declined})`, value: 'declined' },
])

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const filtered = computed(() => {
  const q = normalize(search.value.trim())
  return invitations.value.filter(i =>
    (filter.value === 'all' || i.status === filter.value)
    && (!q || normalize(i.guest_name).includes(q) || normalize(i.notes ?? '').includes(q)),
  )
})

// ---- Modales ----
const formOpen = ref(false)
const editing = ref<Invitation | null>(null)
const shareOpen = ref(false)
const sharing = ref<Invitation | null>(null)
const deleteTarget = ref<Invitation | null>(null)
const regenTarget = ref<Invitation | null>(null)
const busy = ref(false)

const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })
const regenOpen = computed({ get: () => !!regenTarget.value, set: (v) => { if (!v) regenTarget.value = null } })

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openShare(inv: Invitation) {
  sharing.value = inv
  shareOpen.value = true
}

async function onSaved(created: Invitation[]) {
  await refresh()
  // Recién creada una sola: abrir directo el link/QR para enviarla
  if (created.length === 1) openShare(created[0]!)
}

function rowMenu(inv: Invitation): DropdownMenuItem[][] {
  return [
    [
      { label: 'Copiar link', icon: 'i-lucide-link', onSelect: () => copyLink(inv) },
      { label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => { editing.value = inv; formOpen.value = true } },
      { label: 'Generar link nuevo', icon: 'i-lucide-refresh-cw', onSelect: () => { regenTarget.value = inv } },
    ],
    [
      { label: 'Borrar', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { deleteTarget.value = inv } },
    ],
  ]
}

async function copyLink(inv: Invitation) {
  try {
    await navigator.clipboard.writeText(inviteUrl(inv.token))
    toast.add({ color: 'success', title: 'Link copiado', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    openShare(inv)
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  busy.value = true
  const { error } = await client.from('invitations').delete().eq('id', deleteTarget.value.id)
  busy.value = false
  deleteTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
  toast.add({ title: 'Invitación borrada' })
  await refresh()
}

async function confirmRegen() {
  if (!regenTarget.value) return
  const inv = regenTarget.value
  busy.value = true
  const { error } = await client.rpc('regenerate_invitation_token', { p_invitation_id: inv.id })
  busy.value = false
  regenTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo generar', description: errorMessage(error) })
  await refresh()
  const updated = invitations.value.find(i => i.id === inv.id)
  toast.add({ color: 'success', title: 'Link nuevo generado', description: 'El link anterior ya no funciona.' })
  if (updated) openShare(updated)
}

// ---- Exportar a Excel (CSV con ; y BOM para que Excel en español lo abra bien) ----
function exportCsv() {
  const statusText = { pending: 'Pendiente', accepted: 'Asiste', declined: 'No asiste' } as const
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['Nombre', 'Tipo', 'Cupo', 'Estado', 'Confirmados', 'Regalo', 'Respondió', 'Nota', 'Link']
  const lines = invitations.value.map(i => [
    i.guest_name,
    i.max_guests > 1 ? 'Grupo' : 'Individual',
    i.max_guests,
    statusText[i.status],
    i.confirmed_guests ?? '',
    giftByInvitation.value.get(i.id)?.name ?? '',
    i.responded_at ? formatShortDate(i.responded_at) : '',
    i.notes ?? '',
    inviteUrl(i.token),
  ].map(esc).join(';'))

  const csv = '﻿' + [header.join(';'), ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `invitados-${(party.value?.name ?? 'fiesta').replace(/[^\w-]+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Buscar invitado…" class="sm:w-64" />
      <USelect v-model="filter" :items="filterItems" class="sm:w-48" />
      <div class="flex gap-2 sm:ml-auto">
        <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" :disabled="!invitations.length" @click="exportCsv">
          <span class="hidden sm:inline">Exportar</span>
        </UButton>
        <UButton icon="i-lucide-plus" class="flex-1 justify-center sm:flex-none" @click="openCreate">
          Nueva invitación
        </UButton>
      </div>
    </div>

    <UEmpty
      v-if="!invitations.length"
      icon="i-lucide-mail-plus"
      title="Aún no hay invitaciones"
      description="Crea una invitación por persona o por grupo y compártela con su link o QR."
      :actions="[{ label: 'Crear invitación', icon: 'i-lucide-plus', onClick: openCreate }]"
      class="rounded-lg border border-dashed border-default bg-default py-14"
    />

    <p v-else-if="!filtered.length" class="py-10 text-center text-sm text-muted">
      No hay invitaciones que coincidan.
    </p>

    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
      <li v-for="inv in filtered" :key="inv.id" class="flex items-center gap-3 px-4 py-3">
        <UAvatar
          :icon="inv.max_guests > 1 ? 'i-lucide-users' : 'i-lucide-user'"
          size="md"
          class="hidden shrink-0 sm:inline-flex"
        />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p class="truncate font-medium">
              {{ inv.guest_name }}
            </p>
            <InvitationStatusBadge :invitation="inv" size="sm" />
          </div>
          <p class="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
            <span>{{ inv.max_guests > 1 ? `Grupo de hasta ${inv.max_guests}` : 'Individual' }}</span>
            <span v-if="giftByInvitation.get(inv.id)" class="flex items-center gap-1">
              <UIcon name="i-lucide-gift" class="size-3.5" />
              {{ giftByInvitation.get(inv.id)!.name }}
            </span>
            <span v-if="inv.notes" class="italic">{{ inv.notes }}</span>
          </p>
        </div>
        <UButton icon="i-lucide-qr-code" color="primary" variant="soft" size="sm" @click="openShare(inv)">
          <span class="hidden sm:inline">Compartir</span>
        </UButton>
        <UDropdownMenu :items="rowMenu(inv)" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Más acciones" />
        </UDropdownMenu>
      </li>
    </ul>

    <InvitationFormModal v-model:open="formOpen" :invitation="editing" @saved="onSaved" />
    <InvitationShareModal v-model:open="shareOpen" :invitation="sharing" />

    <ConfirmModal
      v-model:open="deleteOpen"
      title="¿Borrar invitación?"
      :description="`El link de ${deleteTarget?.guest_name} dejará de funcionar y, si había apartado un regalo, quedará libre.`"
      confirm-label="Borrar"
      :loading="busy"
      @confirm="confirmDelete"
    />
    <ConfirmModal
      v-model:open="regenOpen"
      title="¿Generar un link nuevo?"
      :description="`El link actual de ${regenTarget?.guest_name} dejará de funcionar. Úsalo si el link se compartió por error. Su respuesta y regalo se mantienen.`"
      confirm-label="Generar link nuevo"
      color="warning"
      :loading="busy"
      @confirm="confirmRegen"
    />
  </div>
</template>
