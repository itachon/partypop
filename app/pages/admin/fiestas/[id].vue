<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const partyId = route.params.id as string

const ctx = await usePartyAdmin(partyId)
providePartyCtx(ctx)
const { party, stats, isClosed, error } = ctx

useHead({ title: () => party.value?.name ?? 'Fiesta' })

if (!error.value && !party.value) {
  throw createError({ statusCode: 404, statusMessage: 'Fiesta no encontrada', fatal: true })
}

const editOpen = ref(false)

const tabs = computed<TabsItem[]>(() => [
  { label: 'Resumen', icon: 'i-lucide-layout-dashboard', value: 'resumen', slot: 'resumen' as const },
  { label: 'Invitaciones', icon: 'i-lucide-mail', value: 'invitaciones', slot: 'invitaciones' as const, badge: stats.value.invitations || undefined },
  { label: 'Regalos', icon: 'i-lucide-gift', value: 'regalos', slot: 'regalos' as const, badge: stats.value.gifts || undefined },
  { label: 'Administradores', icon: 'i-lucide-users', value: 'admins', slot: 'admins' as const },
  { label: 'Ajustes', icon: 'i-lucide-settings', value: 'ajustes', slot: 'ajustes' as const },
])

// Pestaña activa: estado local (cambia al instante) reflejado en ?tab= para
// que recargar o compartir el link abra la misma pestaña
const activeTab = ref((route.query.tab as string) || 'resumen')
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) router.replace({ query: { ...route.query, tab } })
})
watch(() => route.query.tab, (tab) => {
  activeTab.value = (tab as string) || 'resumen'
})
</script>

<template>
  <div v-if="party">
    <UButton to="/admin" color="neutral" variant="link" icon="i-lucide-arrow-left" class="-ml-2.5 mb-2">
      Mis fiestas
    </UButton>

    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold sm:text-3xl">
          {{ party.name }}
        </h1>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide-calendar" class="size-4" />
            {{ formatLongDate(party.event_at) }}
          </span>
          <span v-if="party.location" class="flex items-center gap-1.5">
            <UIcon name="i-lucide-map-pin" class="size-4" />
            {{ party.location }}
          </span>
        </div>
        <div class="mt-2">
          <UBadge v-if="isClosed" color="neutral" variant="subtle" icon="i-lucide-lock">
            Confirmaciones cerradas
          </UBadge>
          <UBadge v-else color="primary" variant="subtle" icon="i-lucide-clock">
            Confirman hasta {{ formatShortDate(party.rsvp_deadline) }}
          </UBadge>
        </div>
      </div>
      <UButton color="neutral" variant="outline" icon="i-lucide-pencil" @click="editOpen = true">
        Editar
      </UButton>
    </div>

    <UTabs
      v-model="activeTab"
      :items="tabs"
      variant="link"
      :unmount-on-hide="false"
      :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }"
    >
      <template #resumen>
        <PartySummary class="pt-6" />
      </template>
      <template #invitaciones>
        <InvitationsPanel class="pt-6" />
      </template>
      <template #regalos>
        <GiftsPanel class="pt-6" />
      </template>
      <template #admins>
        <PartyAdminsPanel class="pt-6" />
      </template>
      <template #ajustes>
        <PartySettings class="pt-6" @edit="editOpen = true" />
      </template>
    </UTabs>

    <PartyFormModal v-model:open="editOpen" :party="party" @saved="() => ctx.refresh()" />
  </div>
</template>
