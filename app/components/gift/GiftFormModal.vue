<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { Tables } from '~~/shared/types/database.types'

const props = defineProps<{ gift?: Tables<'gifts'> | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })

const { party, gifts } = usePartyCtx()
const { client } = useDb()
const photoUrl = useGiftPhotoUrl()
const photos = useGiftPhotos()
const toast = useToast()

const state = reactive({ name: '', description: '', purchaseUrl: '', copies: 1 })
const newPhoto = ref<Blob | null>(null)
const preview = ref<string | null>(null)
const removePhoto = ref(false)
const processing = ref(false)
const loading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const isEdit = computed(() => !!props.gift)

watch(open, (isOpen) => {
  if (!isOpen) return
  const g = props.gift
  state.name = g?.name ?? ''
  state.description = g?.description ?? ''
  state.purchaseUrl = g?.purchase_url ?? ''
  state.copies = 1
  newPhoto.value = null
  removePhoto.value = false
  setPreview(photoUrl(g?.photo_path))
}, { immediate: true })

function setPreview(url: string | null) {
  if (preview.value?.startsWith('blob:')) URL.revokeObjectURL(preview.value)
  preview.value = url
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  processing.value = true
  try {
    const blob = await compressImage(file)
    newPhoto.value = blob
    removePhoto.value = false
    setPreview(URL.createObjectURL(blob))
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo usar la foto', description: errorMessage(err) })
  }
  finally {
    processing.value = false
  }
}

function clearPhoto() {
  newPhoto.value = null
  removePhoto.value = true
  setPreview(null)
}

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!s.name.trim()) errors.push({ name: 'name', message: 'Ingresa el nombre del regalo' })
  if (s.purchaseUrl.trim() && !/^https?:\/\/\S+$/i.test(s.purchaseUrl.trim())) {
    errors.push({ name: 'purchaseUrl', message: 'Debe empezar con http:// o https://' })
  }
  if (!isEdit.value && (!s.copies || s.copies < 1 || s.copies > 20)) {
    errors.push({ name: 'copies', message: 'Entre 1 y 20' })
  }
  return errors
}

async function onSubmit(e: FormSubmitEvent<typeof state>) {
  if (!party.value) return
  loading.value = true
  const oldPath = props.gift?.photo_path ?? null

  try {
    let photoPath = oldPath
    if (newPhoto.value) photoPath = await photos.upload(party.value.id, newPhoto.value)
    else if (removePhoto.value) photoPath = null

    const fields = {
      name: e.data.name.trim(),
      description: e.data.description.trim() || null,
      purchase_url: e.data.purchaseUrl.trim() || null,
      photo_path: photoPath,
    }

    if (props.gift) {
      const { error } = await client.from('gifts').update(fields).eq('id', props.gift.id)
      if (error) throw error
      if (oldPath && oldPath !== photoPath) await photos.removeIfUnused(oldPath)
    }
    else {
      const nextOrder = Math.max(0, ...gifts.value.map(g => g.sort_order)) + 1
      const rows = Array.from({ length: e.data.copies }, (_, i) => ({
        ...fields,
        party_id: party.value!.id,
        sort_order: nextOrder + i,
      }))
      const { error } = await client.from('gifts').insert(rows)
      if (error) {
        if (photoPath) await photos.removeIfUnused(photoPath)
        throw error
      }
    }

    toast.add({
      color: 'success',
      title: isEdit.value ? 'Regalo actualizado' : e.data.copies > 1 ? `${e.data.copies} regalos agregados` : 'Regalo agregado',
    })
    open.value = false
    emit('saved')
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo guardar', description: errorMessage(err) })
  }
  finally {
    loading.value = false
  }
}

onBeforeUnmount(() => setPreview(null))
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Editar regalo' : 'Nuevo regalo'">
    <template #body>
      <UForm id="gift-form" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <div>
          <p class="mb-1.5 text-sm font-medium">
            Foto
          </p>
          <div class="flex items-center gap-4">
            <div class="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elevated ring-1 ring-default">
              <img v-if="preview" :src="preview" alt="" class="size-full object-cover">
              <UIcon v-else name="i-lucide-image" class="size-8 text-dimmed" />
              <div v-if="processing" class="absolute inset-0 flex items-center justify-center bg-default/70">
                <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-upload" :loading="processing" @click="fileInput?.click()">
                {{ preview ? 'Cambiar foto' : 'Subir foto' }}
              </UButton>
              <UButton v-if="preview" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="clearPhoto">
                Quitar foto
              </UButton>
              <p class="text-xs text-dimmed">
                JPG, PNG o WebP. Se optimiza automáticamente.
              </p>
            </div>
            <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onFile">
          </div>
        </div>

        <UFormField label="Nombre" name="name" required>
          <UInput v-model="state.name" placeholder="Set de Lego Friends" class="w-full" />
        </UFormField>

        <UFormField label="Descripción" name="description">
          <UTextarea v-model="state.description" :rows="2" autoresize placeholder="Talla, color, modelo…" class="w-full" />
        </UFormField>

        <UFormField label="Link de compra (opcional)" name="purchaseUrl">
          <UInput v-model="state.purchaseUrl" type="url" placeholder="https://…" icon="i-lucide-link" class="w-full" />
        </UFormField>

        <UFormField
          v-if="!isEdit"
          label="¿Cuántas unidades?"
          name="copies"
          help="Si sirve recibir más de uno, cada unidad aparece por separado en la lista"
        >
          <UInputNumber v-model="state.copies" :min="1" :max="20" class="w-32" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancelar
        </UButton>
        <UButton type="submit" form="gift-form" :loading="loading" :disabled="processing">
          {{ isEdit ? 'Guardar' : 'Agregar' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
