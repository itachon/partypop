<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database.types'

type Gift = Tables<'gifts'>

const { gifts, reservationByGift, stats, refresh } = usePartyCtx()
const { client } = useDb()
const photoUrl = useGiftPhotoUrl()
const photos = useGiftPhotos()
const toast = useToast()

const formOpen = ref(false)
const editing = ref<Gift | null>(null)
const deleteTarget = ref<Gift | null>(null)
const releaseTarget = ref<Gift | null>(null)
const busy = ref(false)

const deleteOpen = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })
const releaseOpen = computed({ get: () => !!releaseTarget.value, set: (v) => { if (!v) releaseTarget.value = null } })

function openCreate() {
  editing.value = null
  formOpen.value = true
}

async function duplicate(g: Gift) {
  const { error } = await client.from('gifts').insert({
    party_id: g.party_id,
    name: g.name,
    description: g.description,
    purchase_url: g.purchase_url,
    photo_path: g.photo_path, // comparte la foto
    sort_order: g.sort_order,
  })
  if (error) return toast.add({ color: 'error', title: 'No se pudo duplicar', description: errorMessage(error) })
  toast.add({ title: 'Regalo duplicado' })
  await refresh()
}

async function move(g: Gift, dir: -1 | 1) {
  const list = gifts.value
  const idx = list.findIndex(x => x.id === g.id)
  const other = list[idx + dir]
  if (!other) return
  // Reasignar orden secuencial e intercambiar los dos
  const ordered = [...list]
  ordered[idx] = other
  ordered[idx + dir] = g
  const updates = ordered
    .map((x, i) => ({ id: x.id, sort_order: i + 1, changed: x.sort_order !== i + 1 }))
    .filter(x => x.changed)
  const results = await Promise.all(updates.map(u => client.from('gifts').update({ sort_order: u.sort_order }).eq('id', u.id)))
  const failed = results.find(r => r.error)
  if (failed?.error) toast.add({ color: 'error', title: 'No se pudo reordenar', description: errorMessage(failed.error) })
  await refresh()
}

function menu(g: Gift, index: number): DropdownMenuItem[][] {
  const reserved = reservationByGift.value.has(g.id)
  return [
    [
      { label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => { editing.value = g; formOpen.value = true } },
      { label: 'Duplicar', icon: 'i-lucide-copy', onSelect: () => duplicate(g) },
      { label: 'Mover antes', icon: 'i-lucide-arrow-left', disabled: index === 0, onSelect: () => move(g, -1) },
      { label: 'Mover después', icon: 'i-lucide-arrow-right', disabled: index === gifts.value.length - 1, onSelect: () => move(g, 1) },
    ],
    ...(reserved ? [[{ label: 'Liberar reserva', icon: 'i-lucide-unlock', onSelect: () => { releaseTarget.value = g } }]] : []),
    [{ label: 'Borrar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = g } }],
  ]
}

async function confirmDelete() {
  const g = deleteTarget.value
  if (!g) return
  busy.value = true
  const { error } = await client.from('gifts').delete().eq('id', g.id)
  if (!error) await photos.removeIfUnused(g.photo_path)
  busy.value = false
  deleteTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
  toast.add({ title: 'Regalo borrado' })
  await refresh()
}

async function confirmRelease() {
  const g = releaseTarget.value
  if (!g) return
  busy.value = true
  const { error } = await client.from('gift_reservations').delete().eq('gift_id', g.id)
  busy.value = false
  releaseTarget.value = null
  if (error) return toast.add({ color: 'error', title: 'No se pudo liberar', description: errorMessage(error) })
  toast.add({ title: 'Reserva liberada' })
  await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">
        <template v-if="gifts.length">
          {{ stats.giftsReserved }} de {{ stats.gifts }} apartados. Los invitados ven qué regalos están apartados, pero no por quién.
        </template>
        <template v-else>
          Los invitados que acepten podrán elegir un regalo de esta lista.
        </template>
      </p>
      <UButton icon="i-lucide-plus" @click="openCreate">
        Agregar regalo
      </UButton>
    </div>

    <UEmpty
      v-if="!gifts.length"
      icon="i-lucide-gift"
      title="La lista de regalos está vacía"
      description="Agrega regalos con foto. Si no agregas ninguno, la invitación no mostrará lista de regalos."
      :actions="[{ label: 'Agregar regalo', icon: 'i-lucide-plus', onClick: openCreate }]"
      class="rounded-lg border border-dashed border-default bg-default py-14"
    />

    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <UCard
        v-for="(g, index) in gifts"
        :key="g.id"
        :ui="{ body: 'p-0 sm:p-0' }"
        class="overflow-hidden"
      >
        <div class="relative aspect-square bg-elevated">
          <img v-if="g.photo_path" :src="photoUrl(g.photo_path)!" :alt="g.name" class="size-full object-cover" loading="lazy">
          <div v-else class="flex size-full items-center justify-center">
            <UIcon name="i-lucide-gift" class="size-10 text-dimmed" />
          </div>
          <UDropdownMenu :items="menu(g, index)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="solid"
              size="xs"
              class="absolute right-2 top-2 opacity-90"
              aria-label="Acciones"
            />
          </UDropdownMenu>
        </div>
        <div class="space-y-1.5 p-3">
          <p class="line-clamp-2 font-medium leading-snug">
            {{ g.name }}
          </p>
          <p v-if="g.description" class="line-clamp-2 text-xs text-muted">
            {{ g.description }}
          </p>
          <UBadge
            v-if="reservationByGift.get(g.id)"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            class="max-w-full"
            :ui="{ label: 'truncate' }"
          >
            {{ reservationByGift.get(g.id)!.guest_name }}
          </UBadge>
          <UBadge v-else color="neutral" variant="outline">
            Disponible
          </UBadge>
        </div>
      </UCard>
    </div>

    <GiftFormModal v-model:open="formOpen" :gift="editing" @saved="refresh" />

    <ConfirmModal
      v-model:open="deleteOpen"
      title="¿Borrar regalo?"
      :description="reservationByGift.get(deleteTarget?.id ?? '')
        ? `${reservationByGift.get(deleteTarget!.id)!.guest_name} ya lo había apartado y se quedará sin regalo elegido.`
        : 'Se quitará de la lista de regalos.'"
      confirm-label="Borrar"
      :loading="busy"
      @confirm="confirmDelete"
    />
    <ConfirmModal
      v-model:open="releaseOpen"
      title="¿Liberar reserva?"
      :description="`${reservationByGift.get(releaseTarget?.id ?? '')?.guest_name ?? 'El invitado'} dejará de tener este regalo apartado y quedará disponible para otros.`"
      confirm-label="Liberar"
      color="warning"
      :loading="busy"
      @confirm="confirmRelease"
    />
  </div>
</template>
