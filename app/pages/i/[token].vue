<script setup lang="ts">
import type { GuestGift, GuestInvitationView } from '~~/shared/types/guest'

definePageMeta({ layout: false })

const route = useRoute()
const token = route.params.token as string
const toast = useToast()

const { data: view, error } = await useFetch<GuestInvitationView>(`/api/i/${token}`, {
  key: `guest-${token}`,
})

const gifts = ref<GuestGift[] | null>(null)
const loadingGifts = ref(false)
const busy = ref<string | null>(null) // acción en curso
const giftsSection = ref<HTMLElement | null>(null)

const inv = computed(() => view.value?.invitation)
const party = computed(() => view.value?.party)
const isOpen = computed(() => !!view.value?.is_open)
const showGifts = computed(() => inv.value?.status === 'accepted' && view.value?.has_gifts)
const myGift = computed(() => gifts.value?.find(g => g.mine) ?? null)

const guests = ref(1)
watch(inv, (i) => {
  if (i) guests.value = i.confirmed_guests ?? i.max_guests
}, { immediate: true })

const editingGuests = ref(false)
const declineOpen = ref(false)

// ---- SEO / vista previa en WhatsApp ----
useSeoMeta({
  title: () => party.value ? `Invitación: ${party.value.name}` : 'Invitación',
  ogTitle: () => party.value ? `🎉 ${party.value.name}` : 'Invitación',
  description: () => inv.value ? `${inv.value.guest_name}, estás invitado/a. Confirma tu asistencia aquí.` : '',
  ogDescription: () => inv.value ? `${inv.value.guest_name}, estás invitado/a. Confirma tu asistencia aquí.` : '',
  robots: 'noindex, nofollow',
})
// Que el token no se filtre al abrir links externos (tiendas, mapas)
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })

// ---- Acciones ----
async function loadGifts() {
  if (!showGifts.value) return
  loadingGifts.value = true
  try {
    gifts.value = await $fetch<GuestGift[]>(`/api/i/${token}/gifts`)
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo cargar la lista de regalos', description: errorMessage(err) })
  }
  finally {
    loadingGifts.value = false
  }
}

async function respond(status: 'accepted' | 'declined') {
  busy.value = status
  try {
    const wasAccepted = inv.value?.status === 'accepted'
    view.value = await $fetch<GuestInvitationView>(`/api/i/${token}/rsvp`, {
      method: 'POST',
      body: { status, confirmed_guests: guests.value },
    })
    editingGuests.value = false
    declineOpen.value = false

    if (status === 'accepted') {
      toast.add({ color: 'success', title: wasAccepted ? 'Cantidad actualizada' : '¡Gracias por confirmar!', icon: 'i-lucide-party-popper' })
      if (!wasAccepted && view.value.has_gifts) {
        await loadGifts()
        await nextTick()
        giftsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    else {
      gifts.value = null
      toast.add({ title: 'Respuesta guardada', description: 'Gracias por avisar.' })
    }
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo guardar tu respuesta', description: errorMessage(err) })
    await refreshNuxtData(`guest-${token}`)
  }
  finally {
    busy.value = null
  }
}

async function reserve(gift: GuestGift) {
  busy.value = gift.id
  try {
    gifts.value = await $fetch<GuestGift[]>(`/api/i/${token}/gifts/${gift.id}`, { method: 'POST' })
    toast.add({ color: 'success', title: `Apartaste: ${gift.name}`, icon: 'i-lucide-gift' })
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo apartar', description: errorMessage(err) })
    await loadGifts() // alguien lo tomó: refrescar estados
  }
  finally {
    busy.value = null
  }
}

async function release() {
  busy.value = 'release'
  try {
    gifts.value = await $fetch<GuestGift[]>(`/api/i/${token}/gift`, { method: 'DELETE' })
    toast.add({ title: 'Liberaste el regalo' })
  }
  catch (err) {
    toast.add({ color: 'error', title: 'No se pudo liberar', description: errorMessage(err) })
  }
  finally {
    busy.value = null
  }
}

onMounted(loadGifts)

const mapsUrl = computed(() =>
  party.value?.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(party.value.location)}` : null,
)

const eventDay = computed(() => formatDay(party.value?.event_at))
const eventTime = computed(() => formatTime(party.value?.event_at))
</script>

<template>
  <div class="min-h-dvh bg-gradient-to-b from-primary-50 via-default to-default dark:from-primary-950/40">
    <!-- Invitación inválida -->
    <div v-if="error || !view" class="flex min-h-dvh items-center justify-center px-6">
      <div class="max-w-sm text-center">
        <UIcon name="i-lucide-mail-x" class="size-12 text-muted" />
        <h1 class="mt-4 text-xl font-semibold">
          Invitación no encontrada
        </h1>
        <p class="mt-2 text-muted">
          El link no es válido o fue reemplazado. Pide a quien te invitó que te lo envíe de nuevo.
        </p>
      </div>
    </div>

    <main v-else-if="inv && party" class="mx-auto max-w-xl px-4 pb-16 pt-10 sm:pt-16">
      <!-- Encabezado -->
      <header class="text-center">
        <div class="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
          <UIcon name="i-lucide-party-popper" class="size-8 text-primary" />
        </div>
        <p class="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-primary">
          {{ inv.is_group ? 'Están invitados' : 'Estás invitado/a' }}
        </p>
        <h1 class="mt-3 text-balance text-3xl font-bold leading-tight sm:text-4xl">
          {{ party.name }}
        </h1>
        <p class="mt-4 text-lg">
          Hola, <span class="font-semibold">{{ inv.guest_name }}</span> 👋
        </p>
      </header>

      <!-- Detalles -->
      <UCard class="mt-8">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex gap-3">
            <UIcon name="i-lucide-calendar-days" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p class="text-xs uppercase tracking-wide text-muted">
                Cuándo
              </p>
              <p class="font-medium">
                {{ eventDay }}
              </p>
              <p class="text-sm text-muted">
                {{ eventTime }} hrs
              </p>
            </div>
          </div>
          <div v-if="party.location" class="flex gap-3">
            <UIcon name="i-lucide-map-pin" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div class="min-w-0">
              <p class="text-xs uppercase tracking-wide text-muted">
                Dónde
              </p>
              <p class="font-medium">
                {{ party.location }}
              </p>
              <ULink
                v-if="mapsUrl"
                :to="mapsUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sm text-primary"
              >
                Ver en el mapa
              </ULink>
            </div>
          </div>
        </div>
        <p v-if="party.description" class="mt-5 whitespace-pre-line border-t border-default pt-5 text-center text-pretty">
          {{ party.description }}
        </p>
      </UCard>

      <!-- Confirmación -->
      <UCard class="mt-4">
        <!-- Pendiente -->
        <template v-if="inv.status === 'pending'">
          <template v-if="isOpen">
            <h2 class="text-center text-lg font-semibold">
              {{ inv.is_group ? '¿Nos acompañan?' : '¿Nos acompañas?' }}
            </h2>
            <div v-if="inv.is_group" class="mt-4 flex flex-col items-center gap-2">
              <p class="text-sm text-muted">
                ¿Cuántas personas asistirán? (hasta {{ inv.max_guests }})
              </p>
              <UInputNumber v-model="guests" :min="1" :max="inv.max_guests" size="lg" class="w-40" />
            </div>
            <div class="mt-5 grid gap-2 sm:grid-cols-2">
              <UButton size="xl" block icon="i-lucide-check" :loading="busy === 'accepted'" :disabled="!!busy" @click="respond('accepted')">
                ¡Sí, {{ inv.is_group ? 'asistiremos' : 'asistiré' }}!
              </UButton>
              <UButton size="xl" block color="neutral" variant="outline" :loading="busy === 'declined'" :disabled="!!busy" @click="respond('declined')">
                No {{ inv.is_group ? 'podremos' : 'podré' }} ir
              </UButton>
            </div>
            <p class="mt-4 text-center text-xs text-muted">
              Responde antes del {{ formatLongDate(party.rsvp_deadline, true) }}
            </p>
          </template>
          <div v-else class="text-center">
            <UIcon name="i-lucide-lock" class="size-6 text-muted" />
            <p class="mt-2 font-medium">
              El plazo para confirmar terminó
            </p>
            <p class="text-sm text-muted">
              Si aún quieres asistir, contacta a quien te invitó.
            </p>
          </div>
        </template>

        <!-- Aceptó -->
        <template v-else-if="inv.status === 'accepted'">
          <div class="text-center">
            <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10">
              <UIcon name="i-lucide-check" class="size-6 text-success" />
            </div>
            <h2 class="mt-3 text-lg font-semibold">
              ¡Confirmado! Nos vemos ahí
            </h2>
            <p v-if="inv.is_group && !editingGuests" class="text-muted">
              Asistirán {{ inv.confirmed_guests }} {{ inv.confirmed_guests === 1 ? 'persona' : 'personas' }}
            </p>
          </div>

          <div v-if="editingGuests" class="mt-4 flex flex-col items-center gap-3">
            <UInputNumber v-model="guests" :min="1" :max="inv.max_guests" size="lg" class="w-40" />
            <div class="flex gap-2">
              <UButton color="neutral" variant="ghost" @click="editingGuests = false; guests = inv.confirmed_guests ?? 1">
                Cancelar
              </UButton>
              <UButton :loading="busy === 'accepted'" @click="respond('accepted')">
                Guardar
              </UButton>
            </div>
          </div>

          <div v-else-if="isOpen" class="mt-4 flex flex-wrap justify-center gap-2">
            <UButton v-if="inv.is_group" size="sm" color="neutral" variant="outline" icon="i-lucide-users" @click="editingGuests = true">
              Cambiar cantidad
            </UButton>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="declineOpen = true">
              Ya no {{ inv.is_group ? 'podremos' : 'podré' }} ir
            </UButton>
          </div>
        </template>

        <!-- Declinó -->
        <template v-else>
          <div class="text-center">
            <p class="text-lg font-semibold">
              Gracias por avisar
            </p>
            <p class="text-muted">
              Registramos que no {{ inv.is_group ? 'podrán' : 'podrás' }} asistir.
            </p>
            <template v-if="isOpen">
              <div v-if="inv.is_group" class="mt-4 flex flex-col items-center gap-2">
                <p class="text-sm text-muted">
                  Si cambian de opinión, ¿cuántos asistirían?
                </p>
                <UInputNumber v-model="guests" :min="1" :max="inv.max_guests" class="w-36" />
              </div>
              <UButton class="mt-4" variant="soft" icon="i-lucide-rotate-ccw" :loading="busy === 'accepted'" @click="respond('accepted')">
                Cambié de opinión, ¡sí {{ inv.is_group ? 'asistiremos' : 'asistiré' }}!
              </UButton>
            </template>
          </div>
        </template>

        <p v-if="inv.status !== 'pending' && isOpen" class="mt-4 text-center text-xs text-muted">
          Puedes cambiar tu respuesta hasta el {{ formatLongDate(party.rsvp_deadline, true) }}
        </p>
      </UCard>

      <!-- Regalos -->
      <section v-if="showGifts" ref="giftsSection" class="mt-10 scroll-mt-6">
        <div class="text-center">
          <UIcon name="i-lucide-gift" class="size-7 text-primary" />
          <h2 class="mt-2 text-xl font-semibold">
            Lista de regalos
          </h2>
          <p class="mx-auto mt-1 max-w-sm text-sm text-muted">
            <template v-if="isOpen">
              Elige {{ inv.is_group ? 'el regalo que llevarán' : 'el regalo que llevarás' }}. Los demás invitados solo verán que está apartado, no quién lo eligió.
            </template>
            <template v-else>
              El plazo para elegir regalo terminó.
            </template>
          </p>
        </div>

        <UAlert
          v-if="myGift"
          class="mt-5"
          color="success"
          variant="subtle"
          icon="i-lucide-gift"
          :title="`Tu regalo: ${myGift.name}`"
          :description="isOpen ? 'Puedes cambiarlo eligiendo otro de la lista.' : undefined"
          :actions="isOpen ? [{ label: 'Liberar', color: 'neutral', variant: 'outline', size: 'xs', loading: busy === 'release', onClick: release }] : undefined"
        />
        <UAlert
          v-else-if="isOpen && gifts?.length && gifts.every(g => g.reserved)"
          class="mt-5"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          description="Todos los regalos ya fueron apartados. ¡Tu presencia es el mejor regalo!"
        />

        <div v-if="loadingGifts && !gifts" class="mt-5 grid grid-cols-2 gap-3">
          <USkeleton v-for="i in 4" :key="i" class="aspect-[3/4] rounded-lg" />
        </div>

        <div v-else-if="gifts" class="mt-5 grid grid-cols-2 gap-3">
          <div
            v-for="g in gifts"
            :key="g.id"
            class="flex flex-col overflow-hidden rounded-lg bg-default ring-1 transition"
            :class="g.mine ? 'ring-2 ring-success' : 'ring-default'"
          >
            <div class="relative aspect-square bg-elevated">
              <img v-if="g.photo_url" :src="g.photo_url" :alt="g.name" class="size-full object-cover" :class="{ 'opacity-40 grayscale': g.reserved && !g.mine }" loading="lazy">
              <div v-else class="flex size-full items-center justify-center">
                <UIcon name="i-lucide-gift" class="size-10 text-dimmed" />
              </div>
              <UBadge v-if="g.mine" color="success" class="absolute left-2 top-2" icon="i-lucide-check">
                Tu regalo
              </UBadge>
              <UBadge v-else-if="g.reserved" color="neutral" class="absolute left-2 top-2" icon="i-lucide-lock">
                Apartado
              </UBadge>
            </div>
            <div class="flex flex-1 flex-col gap-1 p-3">
              <p class="font-medium leading-snug" :class="{ 'text-muted': g.reserved && !g.mine }">
                {{ g.name }}
              </p>
              <p v-if="g.description" class="text-xs text-muted">
                {{ g.description }}
              </p>
              <ULink
                v-if="g.purchase_url"
                :to="g.purchase_url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-primary"
              >
                Ver dónde comprar
              </ULink>
              <div class="mt-auto pt-2">
                <UButton
                  v-if="isOpen && !g.reserved"
                  block
                  size="sm"
                  :variant="myGift ? 'outline' : 'solid'"
                  :loading="busy === g.id"
                  :disabled="!!busy && busy !== g.id"
                  @click="reserve(g)"
                >
                  {{ myGift ? 'Cambiar a este' : 'Elegir este' }}
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ConfirmModal
        v-model:open="declineOpen"
        :title="inv.is_group ? '¿No podrán asistir?' : '¿No podrás asistir?'"
        :description="myGift
          ? `Tu regalo apartado (${myGift.name}) quedará libre para otros invitados.`
          : 'Puedes volver a confirmar mientras el plazo esté abierto.'"
        confirm-label="Sí, no asistiré"
        :loading="busy === 'declined'"
        @confirm="respond('declined')"
      />
    </main>
  </div>
</template>
