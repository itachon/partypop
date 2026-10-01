<script setup lang="ts">
import type { GuestGift } from '~~/shared/types/guest'

// Vista grande de un regalo para el invitado: foto y nombre bien legibles
// antes de elegirlo (pensado también para personas mayores).
const props = defineProps<{
  gift: GuestGift | null
  /** Puede elegir (aceptó y el plazo sigue abierto) */
  canPick: boolean
  /** Ya tiene otro regalo apartado */
  hasMine: boolean
  isGroup: boolean
  isOpen: boolean
  status: 'pending' | 'accepted' | 'declined'
  busy: string | null
}>()

const emit = defineEmits<{ reserve: [gift: GuestGift], release: [] }>()
const open = defineModel<boolean>('open', { default: false })

const takenByOther = computed(() => !!props.gift?.reserved && !props.gift.mine)
// Segunda barrera (la base ya lo exige): nunca renderizar links que no sean http(s)
const purchaseUrl = computed(() => {
  const url = props.gift?.purchase_url
  return url && /^https?:\/\//i.test(url) ? url : null
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="gift?.name ?? 'Regalo'"
    :ui="{ content: 'sm:max-w-2xl', title: 'text-xl sm:text-2xl leading-snug' }"
  >
    <template v-if="gift" #body>
      <div class="relative overflow-hidden rounded-lg bg-elevated">
        <img
          v-if="gift.photo_url"
          :src="gift.photo_url"
          :alt="gift.name"
          class="mx-auto max-h-[60dvh] w-full object-contain"
          :class="{ 'opacity-50 grayscale': takenByOther }"
        >
        <div v-else class="flex aspect-video items-center justify-center">
          <UIcon name="i-lucide-gift" class="size-20 text-dimmed" />
        </div>
        <UBadge v-if="gift.mine" color="success" size="lg" class="absolute left-3 top-3" icon="i-lucide-check">
          Tu regalo
        </UBadge>
        <UBadge v-else-if="gift.reserved" color="neutral" size="lg" class="absolute left-3 top-3" icon="i-lucide-lock">
          Apartado
        </UBadge>
      </div>

      <p v-if="gift.description" class="mt-4 whitespace-pre-line text-lg text-pretty">
        {{ gift.description }}
      </p>

      <UButton
        v-if="purchaseUrl"
        :to="purchaseUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-4 px-0"
        size="lg"
        variant="link"
        icon="i-lucide-external-link"
      >
        Ver dónde comprar
      </UButton>

      <!-- Estado cuando no se puede elegir -->
      <p v-if="takenByOther" class="mt-4 text-lg text-muted">
        Este regalo ya lo apartó otro invitado.
      </p>
      <p v-else-if="!isOpen" class="mt-4 text-lg text-muted">
        El plazo para elegir regalo terminó.
      </p>
      <p v-else-if="status === 'pending'" class="mt-4 text-lg text-muted">
        Confirma tu asistencia para poder elegir este regalo.
      </p>
      <p v-else-if="status === 'declined'" class="mt-4 text-lg text-muted">
        Si cambias de opinión y confirmas, podrás elegir este regalo.
      </p>
    </template>

    <template #footer>
      <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UButton size="xl" color="neutral" variant="ghost" block class="sm:w-auto" @click="open = false">
          Cerrar
        </UButton>
        <UButton
          v-if="gift && canPick && gift.mine"
          size="xl"
          color="neutral"
          variant="outline"
          icon="i-lucide-undo-2"
          block
          class="sm:w-auto"
          :loading="busy === 'release'"
          :disabled="!!busy && busy !== 'release'"
          @click="emit('release')"
        >
          Liberar este regalo
        </UButton>
        <UButton
          v-else-if="gift && canPick && !gift.reserved"
          size="xl"
          icon="i-lucide-gift"
          block
          class="sm:w-auto"
          :loading="busy === gift.id"
          :disabled="!!busy && busy !== gift.id"
          @click="emit('reserve', gift)"
        >
          {{ hasMine ? 'Cambiar a este regalo' : (isGroup ? 'Elegimos este regalo' : 'Elijo este regalo') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
