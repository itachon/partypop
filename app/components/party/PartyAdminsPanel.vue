<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

const { party, admins, isOwner, refresh } = usePartyCtx()
const { client, userId } = useDb()
const toast = useToast()

const state = reactive({ email: '' })
const adding = ref(false)

const toRemove = ref<{ user_id: string, label: string } | null>(null)
const removeOpen = computed({
  get: () => !!toRemove.value,
  set: (v) => { if (!v) toRemove.value = null },
})
const removing = ref(false)

function validate(s: typeof state): FormError[] {
  return /^\S+@\S+\.\S+$/.test(s.email.trim()) ? [] : [{ name: 'email', message: 'Correo no válido' }]
}

async function addAdmin(e: FormSubmitEvent<typeof state>) {
  if (!party.value) return
  adding.value = true
  const { error } = await client.rpc('add_party_admin', { p_party_id: party.value.id, p_email: e.data.email.trim() })
  adding.value = false
  if (error) {
    toast.add({ color: 'error', title: 'No se pudo agregar', description: errorMessage(error) })
    return
  }
  toast.add({ color: 'success', title: 'Administrador agregado' })
  state.email = ''
  await refresh()
}

async function confirmRemove() {
  if (!toRemove.value || !party.value) return
  const leaving = toRemove.value.user_id === userId.value
  removing.value = true
  const { error } = await client.from('party_admins')
    .delete()
    .eq('party_id', party.value.id)
    .eq('user_id', toRemove.value.user_id)
  removing.value = false
  toRemove.value = null
  if (error) {
    toast.add({ color: 'error', title: 'No se pudo quitar', description: errorMessage(error) })
    return
  }
  if (leaving) {
    toast.add({ title: 'Saliste de la fiesta' })
    return navigateTo('/admin')
  }
  toast.add({ title: 'Administrador quitado' })
  await refresh()
}

const ownerLabel = computed(() => party.value?.owner?.full_name || party.value?.owner?.email || 'Creador')
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <UCard>
      <template #header>
        <h3 class="font-semibold">
          Quiénes administran esta fiesta
        </h3>
        <p class="text-sm text-muted">
          Los administradores pueden editar la fiesta, las invitaciones y los regalos. Solo el creador puede agregar o quitar administradores y borrar la fiesta.
        </p>
      </template>

      <ul class="divide-y divide-default">
        <li class="flex items-center justify-between gap-3 py-3 first:pt-0">
          <UUser
            :name="ownerLabel"
            :description="party?.owner?.email"
            :avatar="{ icon: 'i-lucide-crown' }"
          />
          <UBadge color="primary" variant="subtle">
            Creador
          </UBadge>
        </li>
        <li v-for="a in admins" :key="a.user_id" class="flex items-center justify-between gap-3 py-3 last:pb-0">
          <UUser
            :name="a.profile?.full_name || a.profile?.email || 'Usuario'"
            :description="a.profile?.email"
            :avatar="{ icon: 'i-lucide-user' }"
          />
          <UButton
            v-if="isOwner"
            color="error"
            variant="ghost"
            icon="i-lucide-user-minus"
            aria-label="Quitar administrador"
            @click="toRemove = { user_id: a.user_id, label: a.profile?.full_name || a.profile?.email || 'este usuario' }"
          />
          <UButton
            v-else-if="a.user_id === userId"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-log-out"
            @click="toRemove = { user_id: a.user_id, label: 'ti' }"
          >
            Salir
          </UButton>
        </li>
      </ul>
    </UCard>

    <UCard v-if="isOwner">
      <template #header>
        <h3 class="font-semibold">
          Agregar administrador
        </h3>
        <p class="text-sm text-muted">
          La persona debe tener una cuenta creada con ese correo.
        </p>
      </template>
      <UForm :state="state" :validate="validate" class="flex flex-col gap-3 sm:flex-row sm:items-start" @submit="addAdmin">
        <UFormField name="email" class="flex-1">
          <UInput v-model="state.email" type="email" placeholder="correo@ejemplo.cl" icon="i-lucide-mail" class="w-full" />
        </UFormField>
        <UButton type="submit" icon="i-lucide-user-plus" :loading="adding">
          Agregar
        </UButton>
      </UForm>
    </UCard>

    <ConfirmModal
      v-model:open="removeOpen"
      :title="toRemove?.user_id === userId ? '¿Salir de esta fiesta?' : '¿Quitar administrador?'"
      :description="toRemove?.user_id === userId
        ? 'Dejarás de ver y administrar esta fiesta.'
        : `${toRemove?.label} ya no podrá ver ni administrar esta fiesta.`"
      :confirm-label="toRemove?.user_id === userId ? 'Salir' : 'Quitar'"
      :loading="removing"
      @confirm="confirmRemove"
    />
  </div>
</template>
