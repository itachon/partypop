<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database.types'

const props = defineProps<{ party?: Tables<'parties'> | null }>()
const emit = defineEmits<{ saved: [party: Tables<'parties'>] }>()
const open = defineModel<boolean>('open', { default: false })

const { client } = useDb()
const toast = useToast()

const state = reactive({
  name: '',
  description: '',
  location: '',
  eventAt: '',
  rsvpDeadline: '',
})
const loading = ref(false)

// Cargar datos al abrir
watch(open, (isOpen) => {
  if (!isOpen) return
  const p = props.party
  state.name = p?.name ?? ''
  state.description = p?.description ?? ''
  state.location = p?.location ?? ''
  state.eventAt = toLocalInput(p?.event_at)
  state.rsvpDeadline = toLocalInput(p?.rsvp_deadline)
}, { immediate: true })

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Ponle un nombre a la fiesta' })
  if (!s.eventAt) errors.push({ name: 'eventAt', message: 'Indica cuándo es' })
  if (!s.rsvpDeadline) errors.push({ name: 'rsvpDeadline', message: 'Indica hasta cuándo pueden confirmar' })
  if (s.eventAt && s.rsvpDeadline && new Date(s.rsvpDeadline) > new Date(s.eventAt)) {
    errors.push({ name: 'rsvpDeadline', message: 'Debe ser antes de la fiesta' })
  }
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  loading.value = true
  const payload = {
    name: e.data.name.trim(),
    description: e.data.description.trim() || null,
    location: e.data.location.trim() || null,
    event_at: fromLocalInput(e.data.eventAt),
    rsvp_deadline: fromLocalInput(e.data.rsvpDeadline),
  }

  const query = props.party
    ? client.from('parties').update(payload).eq('id', props.party.id).select().single()
    : client.from('parties').insert(payload).select().single()

  const { data, error } = await query
  loading.value = false

  if (error || !data) {
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(error) })
    return
  }
  toast.add({ color: 'success', title: props.party ? 'Fiesta actualizada' : 'Fiesta creada' })
  open.value = false
  emit('saved', data)
}
</script>

<template>
  <UModal v-model:open="open" :title="party ? 'Editar fiesta' : 'Nueva fiesta'">
    <template #body>
      <UForm id="party-form" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField label="Nombre" name="name" required>
          <UInput v-model="state.name" placeholder="Cumpleaños de Sofía" class="w-full" autofocus />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Fecha y hora" name="eventAt" required>
            <UInput v-model="state.eventAt" type="datetime-local" class="w-full" />
          </UFormField>
          <UFormField label="Confirmar hasta" name="rsvpDeadline" required help="Después de esta fecha nadie puede responder ni cambiar su regalo">
            <UInput v-model="state.rsvpDeadline" type="datetime-local" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Lugar" name="location">
          <UInput v-model="state.location" placeholder="Av. Alemania 0123, Temuco" class="w-full" />
        </UFormField>

        <UFormField label="Mensaje para los invitados" name="description">
          <UTextarea v-model="state.description" :rows="4" autoresize placeholder="¡Te esperamos para celebrar!" class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="party-form" :loading="loading">
          {{ party ? 'Guardar' : 'Crear fiesta' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
