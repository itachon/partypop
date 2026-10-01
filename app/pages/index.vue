<script setup lang="ts">
useHead({ title: 'Invitaciones' })
const user = useSupabaseUser()

const features = [
  { icon: 'i-lucide-qr-code', title: 'Link y QR únicos', text: 'Cada invitado recibe su propio link o código QR. Compártelo por WhatsApp en un toque.' },
  { icon: 'i-lucide-users', title: 'Individuales o grupales', text: 'Invita a una persona o a una familia completa y sabe exactamente cuántos asistirán.' },
  { icon: 'i-lucide-gift', title: 'Lista de regalos sin repetidos', text: 'Cada invitado aparta un regalo. Los demás ven que está tomado, pero no por quién.' },
]
</script>

<template>
  <div class="min-h-dvh bg-gradient-to-b from-primary-50 to-default dark:from-primary-950/40">
    <UContainer class="py-20 text-center sm:py-28">
      <div class="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
        <UIcon name="i-lucide-party-popper" class="size-8 text-primary" />
      </div>
      <h1 class="mt-6 text-balance text-4xl font-bold sm:text-5xl">
        Invitaciones para tu fiesta, sin enredos
      </h1>
      <p class="mx-auto mt-4 max-w-xl text-lg text-muted">
        Crea la fiesta, envía invitaciones con link o QR, recibe las confirmaciones y organiza la lista de regalos.
      </p>
      <div class="mt-8 flex justify-center gap-3">
        <template v-if="user">
          <UButton to="/admin" size="xl" trailing-icon="i-lucide-arrow-right">
            Ir a mis fiestas
          </UButton>
        </template>
        <template v-else>
          <UButton to="/registro" size="xl">
            Crear cuenta gratis
          </UButton>
          <UButton to="/login" size="xl" color="neutral" variant="outline">
            Ingresar
          </UButton>
        </template>
      </div>

      <div class="mx-auto mt-20 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
        <UCard v-for="f in features" :key="f.title">
          <UIcon :name="f.icon" class="size-6 text-primary" />
          <h2 class="mt-3 font-semibold">
            {{ f.title }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ f.text }}
          </p>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>
