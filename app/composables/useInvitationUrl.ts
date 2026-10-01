/** Arma la URL pública de una invitación a partir de su token */
export function useInvitationUrl() {
  const config = useRuntimeConfig()
  const origin = useRequestURL().origin
  const base = (config.public.siteUrl as string) || origin
  return (token: string) => `${base.replace(/\/$/, '')}/i/${token}`
}
