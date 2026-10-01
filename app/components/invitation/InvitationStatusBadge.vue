<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

const props = defineProps<{ invitation: Tables<'invitations'> }>()

const info = computed(() => {
  const i = props.invitation
  if (i.status === 'accepted') {
    const label = i.max_guests > 1 ? `Asiste (${i.confirmed_guests}/${i.max_guests})` : 'Asiste'
    return { label, color: 'success' as const, icon: 'i-lucide-check' }
  }
  if (i.status === 'declined') return { label: 'No asiste', color: 'neutral' as const, icon: 'i-lucide-x' }
  return { label: 'Pendiente', color: 'warning' as const, icon: 'i-lucide-clock' }
})
</script>

<template>
  <UBadge :color="info.color" variant="subtle" :icon="info.icon">
    {{ info.label }}
  </UBadge>
</template>
