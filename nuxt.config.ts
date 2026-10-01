// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-09-30",
  devtools: { enabled: true },

  modules: ["@nuxt/ui", "@nuxtjs/supabase"],

  css: ["~/assets/css/main.css"],

  // Los componentes se usan por su nombre de archivo, sin prefijo de carpeta
  components: [{ path: "~/components", pathPrefix: false }],

  supabase: {
    types: "~~/shared/types/database.types.ts",
    redirectOptions: {
      login: "/login",
      callback: "/confirm",
      // Solo el portal de administración exige sesión.
      // La invitación pública (/i/:token) y la portada quedan libres.
      include: ["/admin(/*)?"],
      exclude: ["/registro"],
      saveRedirectToCookie: true,
    },
  },

  runtimeConfig: {
    public: {
      // URL pública del sitio, para armar los links y QR de invitación.
      // Vacío = usa el dominio desde donde se abrió el panel.
      siteUrl: "",
      // Zona horaria en que se muestran y se ingresan las fechas de las fiestas
      timeZone: "America/Santiago",
    },
  },
  experimental: {
    viteEnvironmentApi: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: "es" },
      title: "Invitaciones",
    },
  },
});
