<script setup lang="ts">
const { stats, invitations, gifts, giftByInvitation } = usePartyCtx()

const recent = computed(() =>
  invitations.value
    .filter(i => i.responded_at)
    .sort((a, b) => b.responded_at!.localeCompare(a.responded_at!))
    .slice(0, 6),
)

const responseRate = computed(() =>
  stats.value.invitations ? Math.round(((stats.value.accepted + stats.value.declined) / stats.value.invitations) * 100) : 0,
)
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <UCard>
        <p class="text-sm text-muted">
          Personas confirmadas
        </p>
        <p class="mt-1 text-3xl font-bold text-primary">
          {{ stats.confirmedPeople }}
        </p>
        <p class="text-xs text-dimmed">
          de {{ stats.invitedPeople }} cupos invitados
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Aceptaron
        </p>
        <p class="mt-1 text-3xl font-bold text-success">
          {{ stats.accepted }}
        </p>
        <p class="text-xs text-dimmed">
          invitaciones
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          Sin responder
        </p>
        <p class="mt-1 text-3xl font-bold text-warning">
          {{ stats.pending }}
        </p>
        <p class="text-xs text-dimmed">
          invitaciones
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          No asistirán
        </p>
        <p class="mt-1 text-3xl font-bold text-muted">
          {{ stats.declined }}
        </p>
        <p class="text-xs text-dimmed">
          invitaciones
        </p>
      </UCard>
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <UCard>
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">Respuestas</span>
          <span class="text-muted">{{ responseRate }}%</span>
        </div>
        <UProgress :model-value="responseRate" class="mt-3" />
        <p class="mt-2 text-xs text-dimmed">
          {{ stats.accepted + stats.declined }} de {{ stats.invitations }} invitaciones respondidas
        </p>
      </UCard>
      <UCard>
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">Regalos apartados</span>
          <span class="text-muted">{{ stats.giftsReserved }} / {{ stats.gifts }}</span>
        </div>
        <UProgress :model-value="stats.gifts ? (stats.giftsReserved / stats.gifts) * 100 : 0" class="mt-3" />
        <p class="mt-2 text-xs text-dimmed">
          {{ gifts.length ? `${stats.gifts - stats.giftsReserved} disponibles` : 'Aún no hay lista de regalos' }}
        </p>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h3 class="font-semibold">
          Últimas respuestas
        </h3>
      </template>
      <p v-if="!recent.length" class="text-sm text-muted">
        Todavía nadie ha respondido. Comparte las invitaciones desde la pestaña Invitaciones.
      </p>
      <ul v-else class="divide-y divide-default">
        <li v-for="inv in recent" :key="inv.id" class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div class="min-w-0">
            <p class="truncate font-medium">
              {{ inv.guest_name }}
            </p>
            <p class="text-xs text-dimmed">
              {{ formatShortDate(inv.responded_at) }}
              <template v-if="giftByInvitation.get(inv.id)">
                · regalo: {{ giftByInvitation.get(inv.id)!.name }}
              </template>
            </p>
          </div>
          <InvitationStatusBadge :invitation="inv" />
        </li>
      </ul>
    </UCard>
  </div>
</template>
