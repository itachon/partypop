<script setup lang="ts">
const emit = defineEmits<{ edit: [] }>()

const { party, isOwner, stats } = usePartyCtx()
const { client } = useDb()
const toast = useToast()

const deleteOpen = ref(false)
const deleting = ref(false)
const confirmText = ref('')

async function deleteParty() {
  if (!party.value) return
  deleting.value = true

  // Borrar fotos del storage antes de la fiesta (la BD borra el resto en cascada)
  const folder = party.value.id
  const { data: files } = await client.storage.from('gift-photos').list(folder, { limit: 1000 })
  if (files?.length) {
    await client.storage.from('gift-photos').remove(files.map(f => `${folder}/${f.name}`))
  }

  const { error } = await client.from('parties').delete().eq('id', party.value.id)
  deleting.value = false
  if (error) {
    toast.add({ color: 'error', title: 'No se pudo borrar', description: errorMessage(error) })
    return
  }
  toast.add({ title: 'Fiesta borrada' })
  await navigateTo('/admin')
}
</script>

<template>
  <div v-if="party" class="max-w-2xl space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-semibold">
            Datos de la fiesta
          </h3>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-pencil" @click="emit('edit')">
            Editar
          </UButton>
        </div>
      </template>
      <dl class="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-muted">
            Fecha
          </dt>
          <dd class="font-medium">
            {{ formatLongDate(party.event_at) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Confirmar hasta
          </dt>
          <dd class="font-medium">
            {{ formatLongDate(party.rsvp_deadline) }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-muted">
            Lugar
          </dt>
          <dd class="font-medium">
            {{ party.location || '—' }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-muted">
            Mensaje
          </dt>
          <dd class="whitespace-pre-line">
            {{ party.description || '—' }}
          </dd>
        </div>
      </dl>
    </UCard>

    <UCard v-if="isOwner" :ui="{ root: 'ring-error/40' }">
      <template #header>
        <h3 class="font-semibold text-error">
          Zona peligrosa
        </h3>
      </template>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Borra la fiesta con sus {{ stats.invitations }} invitaciones, {{ stats.gifts }} regalos y fotos. No se puede deshacer.
        </p>
        <UButton color="error" variant="soft" icon="i-lucide-trash-2" @click="confirmText = ''; deleteOpen = true">
          Borrar fiesta
        </UButton>
      </div>
    </UCard>

    <ConfirmModal
      v-model:open="deleteOpen"
      title="¿Borrar esta fiesta?"
      description="Los links de invitación dejarán de funcionar."
      confirm-label="Borrar definitivamente"
      :loading="deleting"
      :disabled="confirmText.trim() !== party.name.trim()"
      @confirm="deleteParty"
    >
      <UFormField :label="`Escribe «${party.name}» para confirmar`">
        <UInput v-model="confirmText" class="w-full" />
      </UFormField>
    </ConfirmModal>
  </div>
</template>
