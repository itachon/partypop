<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database.types'

const props = defineProps<{ invitation?: Tables<'invitations'> | null }>()
const emit = defineEmits<{ saved: [created: Tables<'invitations'>[]] }>()
const open = defineModel<boolean>('open', { default: false })

const { party, invitations } = usePartyCtx()
const { client } = useDb()
const toast = useToast()

const state = reactive({
  mode: 'single' as 'single' | 'bulk',
  guestName: '',
  bulkNames: '',
  kind: 'individual' as 'individual' | 'group',
  maxGuests: 2,
  notes: '',
})
const loading = ref(false)
const isEdit = computed(() => !!props.invitation)

watch(open, (isOpen) => {
  if (!isOpen) return
  const i = props.invitation
  state.mode = 'single'
  state.guestName = i?.guest_name ?? ''
  state.bulkNames = ''
  state.kind = i && i.max_guests > 1 ? 'group' : 'individual'
  state.maxGuests = i && i.max_guests > 1 ? i.max_guests : 2
  state.notes = i?.notes ?? ''
}, { immediate: true })

const bulkList = computed(() =>
  state.bulkNames.split('\n').map(s => s.trim()).filter(Boolean),
)

const minGroup = computed(() => {
  // No se puede bajar el cupo por debajo de los ya confirmados
  const c = props.invitation?.confirmed_guests ?? 0
  return Math.max(2, c)
})

const kindItems = [
  { label: 'Individual', value: 'individual', description: 'Una persona' },
  { label: 'Grupo / familia', value: 'group', description: 'Varias personas, un solo link y un solo regalo' },
]

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (s.mode === 'single' && !s.guestName.trim()) errors.push({ name: 'guestName', message: 'Ingresa el nombre' })
  if (s.mode === 'bulk' && !bulkList.value.length) errors.push({ name: 'bulkNames', message: 'Escribe al menos un nombre' })
  if (s.mode === 'bulk' && bulkList.value.some(n => n.length > 120)) errors.push({ name: 'bulkNames', message: 'Cada nombre puede tener hasta 120 caracteres' })
  if (s.kind === 'group' && (!s.maxGuests || s.maxGuests < minGroup.value || s.maxGuests > 50)) {
    errors.push({ name: 'maxGuests', message: `Entre ${minGroup.value} y 50 personas` })
  }
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!party.value) return
  loading.value = true
  const maxGuests = e.data.kind === 'group' ? e.data.maxGuests : 1
  const notes = e.data.notes.trim() || null

  if (props.invitation) {
    const { data, error } = await client.from('invitations')
      .update({ guest_name: e.data.guestName.trim(), max_guests: maxGuests, notes })
      .eq('id', props.invitation.id)
      .select()
      .single()
    loading.value = false
    if (error || !data) {
      toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(error) })
      return
    }
    toast.add({ color: 'success', title: 'Invitación actualizada' })
    open.value = false
    emit('saved', [])
    return
  }

  const names = e.data.mode === 'bulk' ? bulkList.value : [e.data.guestName.trim()]
  const rows = names.map(guest_name => ({ party_id: party.value!.id, guest_name, max_guests: maxGuests, notes }))
  const { data, error } = await client.from('invitations').insert(rows).select()
  loading.value = false

  if (error || !data) {
    toast.add({ color: 'error', title: 'No se pudo crear', description: errorMessage(error) })
    return
  }
  toast.add({ color: 'success', title: data.length > 1 ? `${data.length} invitaciones creadas` : 'Invitación creada' })
  open.value = false
  emit('saved', data)
}

// Aviso de nombre repetido (no bloquea: puede haber dos "Juan")
const duplicateWarning = computed(() => {
  if (isEdit.value || state.mode !== 'single') return ''
  const n = state.guestName.trim().toLowerCase()
  return n && invitations.value.some(i => i.guest_name.trim().toLowerCase() === n)
    ? 'Ya existe una invitación con ese nombre.'
    : ''
})
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Editar invitación' : 'Nueva invitación'">
    <template #body>
      <UForm id="invitation-form" :state="state" :validate="validate" class="space-y-5" @submit="onSubmit">
        <UTabs
          v-if="!isEdit"
          v-model="state.mode"
          :items="[{ label: 'Una invitación', value: 'single' }, { label: 'Varias a la vez', value: 'bulk' }]"
          :content="false"
          size="sm"
        />

        <UFormField v-if="state.mode === 'single'" label="Nombre del invitado" name="guestName" required :hint="duplicateWarning">
          <UInput v-model="state.guestName" :placeholder="state.kind === 'group' ? 'Familia Pérez' : 'Juan Soto'" class="w-full" autofocus />
        </UFormField>

        <UFormField
          v-else
          label="Nombres (uno por línea)"
          name="bulkNames"
          required
          :help="bulkList.length ? `Se crearán ${bulkList.length} invitaciones` : 'Pega una lista desde Excel o WhatsApp'"
        >
          <UTextarea v-model="state.bulkNames" :rows="7" placeholder="Juan Soto&#10;María Rojas&#10;Familia Pérez" class="w-full" autofocus />
        </UFormField>

        <UFormField label="Tipo" name="kind">
          <URadioGroup v-model="state.kind" :items="kindItems" variant="card" orientation="horizontal" :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2' }" />
        </UFormField>

        <UFormField
          v-if="state.kind === 'group'"
          label="¿Hasta cuántas personas?"
          name="maxGuests"
          help="Al confirmar, el grupo indica cuántos asistirán"
        >
          <UInputNumber v-model="state.maxGuests" :min="minGroup" :max="50" class="w-40" />
        </UFormField>

        <UFormField label="Nota interna" name="notes" help="Solo la ven los administradores">
          <UInput v-model="state.notes" placeholder="Ej: compañeros de trabajo" class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="invitation-form" :loading="loading">
          {{ isEdit ? 'Guardar' : state.mode === 'bulk' && bulkList.length > 1 ? `Crear ${bulkList.length}` : 'Crear invitación' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
