<script setup lang="ts">
import QRCode from 'qrcode'
import type { Tables } from '~~/shared/types/database.types'

const props = defineProps<{ invitation: Tables<'invitations'> | null }>()
const open = defineModel<boolean>('open', { default: false })

const { party } = usePartyCtx()
const inviteUrl = useInvitationUrl()
const toast = useToast()

const qrDataUrl = ref('')
const url = computed(() => (props.invitation ? inviteUrl(props.invitation.token) : ''))

const message = computed(() => {
  if (!props.invitation || !party.value) return ''
  return `¡Hola ${props.invitation.guest_name}! Te invito a ${party.value.name} 🎉\n`
    + `Confirma tu asistencia aquí: ${url.value}`
})

const whatsappHref = computed(() => `https://wa.me/?text=${encodeURIComponent(message.value)}`)
const canNativeShare = ref(false)

const fileName = computed(() => {
  const slug = (props.invitation?.guest_name ?? 'invitacion')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `invitacion-${slug || 'qr'}.png`
})

watch([open, url], async ([isOpen, u]) => {
  if (!isOpen || !u) return
  qrDataUrl.value = await QRCode.toDataURL(u, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
}, { immediate: true })

onMounted(() => {
  canNativeShare.value = typeof navigator !== 'undefined' && 'share' in navigator
})

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ color: 'success', title: `${what} copiado`, icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ color: 'error', title: 'No se pudo copiar' })
  }
}

async function nativeShare() {
  try {
    await navigator.share({ title: party.value?.name, text: message.value })
  }
  catch { /* el usuario canceló */ }
}
</script>

<template>
  <UModal v-model:open="open" :title="`Invitación de ${invitation?.guest_name ?? ''}`" description="Comparte el link o el código QR. Es único para este invitado.">
    <template #body>
      <div v-if="invitation" class="space-y-5">
        <div class="flex justify-center">
          <div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-default">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="Código QR de la invitación" class="size-56">
            <USkeleton v-else class="size-56" />
          </div>
        </div>

        <UFieldGroup class="w-full">
          <UInput :model-value="url" readonly class="flex-1" :ui="{ base: 'font-mono text-xs' }" @focus="($event.target as HTMLInputElement).select()" />
          <UButton color="neutral" variant="outline" icon="i-lucide-copy" aria-label="Copiar link" @click="copy(url, 'Link')" />
        </UFieldGroup>

        <div class="grid gap-2 sm:grid-cols-2">
          <UButton
            :to="whatsappHref"
            target="_blank"
            icon="i-lucide-message-circle"
            color="success"
            block
          >
            Enviar por WhatsApp
          </UButton>
          <UButton
            :href="qrDataUrl"
            :download="fileName"
            icon="i-lucide-download"
            color="neutral"
            variant="outline"
            block
            :disabled="!qrDataUrl"
          >
            Descargar QR
          </UButton>
          <UButton icon="i-lucide-text" color="neutral" variant="outline" block @click="copy(message, 'Mensaje')">
            Copiar mensaje
          </UButton>
          <UButton v-if="canNativeShare" icon="i-lucide-share-2" color="neutral" variant="outline" block @click="nativeShare">
            Compartir…
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
