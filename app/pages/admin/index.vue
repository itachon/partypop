<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Mis fiestas' })

type PartyRow = Tables<'parties'> & {
  invitations: { count: number }[]
  gifts: { count: number }[]
}

const { client, userId } = useDb()
const createOpen = ref(false)

const { data: parties, status, refresh } = await useAsyncData('admin-parties', async () => {
  const { data, error } = await client
    .from('parties')
    .select('*, invitations(count), gifts(count)')
    .order('event_at', { ascending: true })
  if (error) throw error
  return data as unknown as PartyRow[]
})

const upcoming = computed(() => (parties.value ?? []).filter(p => new Date(p.event_at) >= new Date()))
const past = computed(() => (parties.value ?? []).filter(p => new Date(p.event_at) < new Date()).reverse())

function onCreated(p: Tables<'parties'>) {
  navigateTo(`/admin/fiestas/${p.id}`)
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">
          Mis fiestas
        </h1>
        <p class="text-sm text-muted">
          Fiestas que creaste o que administras con otras personas
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="createOpen = true">
        Nueva fiesta
      </UButton>
    </div>

    <div v-if="status === 'pending' && !parties" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <USkeleton v-for="i in 3" :key="i" class="h-36 rounded-lg" />
    </div>

    <UEmpty
      v-else-if="!parties?.length"
      icon="i-lucide-party-popper"
      title="Aún no tienes fiestas"
      description="Crea tu primera fiesta para empezar a enviar invitaciones."
      :actions="[{ label: 'Crear fiesta', icon: 'i-lucide-plus', onClick: () => { createOpen = true } }]"
      class="rounded-lg border border-dashed border-default bg-default py-16"
    />

    <template v-else>
      <section v-if="upcoming.length" class="space-y-3">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PartyCard v-for="p in upcoming" :key="p.id" :party="p" :is-owner="p.owner_id === userId" />
        </div>
      </section>

      <section v-if="past.length" class="mt-10 space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          Pasadas
        </h2>
        <div class="grid gap-4 opacity-75 sm:grid-cols-2 lg:grid-cols-3">
          <PartyCard v-for="p in past" :key="p.id" :party="p" :is-owner="p.owner_id === userId" />
        </div>
      </section>
    </template>

    <PartyFormModal v-model:open="createOpen" @saved="onCreated" />
  </div>
</template>
