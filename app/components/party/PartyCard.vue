<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

defineProps<{
  party: Tables<'parties'> & { invitations: { count: number }[], gifts: { count: number }[] }
  isOwner: boolean
}>()
</script>

<template>
  <NuxtLink :to="`/admin/fiestas/${party.id}`" class="group block">
    <UCard class="h-full transition group-hover:ring-2 group-hover:ring-primary/50">
      <div class="flex items-start justify-between gap-2">
        <h3 class="text-lg font-semibold leading-tight group-hover:text-primary">
          {{ party.name }}
        </h3>
        <UBadge v-if="!isOwner" color="neutral" variant="subtle" size="sm">
          Co-admin
        </UBadge>
      </div>
      <p class="mt-2 flex items-center gap-1.5 text-sm text-muted">
        <UIcon name="i-lucide-calendar" class="size-4 shrink-0" />
        {{ formatShortDate(party.event_at) }}
        <span class="text-dimmed">· {{ relativeDays(party.event_at) }}</span>
      </p>
      <p v-if="party.location" class="mt-1 flex items-center gap-1.5 truncate text-sm text-muted">
        <UIcon name="i-lucide-map-pin" class="size-4 shrink-0" />
        <span class="truncate">{{ party.location }}</span>
      </p>
      <div class="mt-4 flex gap-4 text-sm">
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-mail" class="size-4 text-primary" />
          {{ party.invitations[0]?.count ?? 0 }} invitaciones
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-gift" class="size-4 text-primary" />
          {{ party.gifts[0]?.count ?? 0 }} regalos
        </span>
      </div>
    </UCard>
  </NuxtLink>
</template>
