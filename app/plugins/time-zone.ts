// Fija la zona horaria de la app antes de renderizar (servidor y navegador)
export default defineNuxtPlugin(() => {
  setAppTimeZone(useRuntimeConfig().public.timeZone as string)
})
