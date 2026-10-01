# Invitaciones

Sistema de invitaciones a fiestas: portal de administración con varias personas por fiesta, invitaciones individuales o grupales con link/QR único, confirmación de asistencia y lista de regalos donde nadie ve quién eligió qué.

**Stack:** Nuxt 4 · Vue 3 · Nuxt UI 4 · Supabase (Postgres, Auth, Storage)

## Qué hace

**Administrador** (`/admin`, requiere cuenta)
- Registro e inicio de sesión
- Crear fiestas con fecha, lugar, mensaje y **fecha límite para confirmar**
- Resumen: personas confirmadas, respuestas pendientes, regalos apartados, últimas respuestas
- Invitaciones **individuales o grupales** (grupo de hasta N personas, un link y un regalo)
- Crear invitaciones una a una o **varias a la vez** pegando una lista de nombres
- Compartir cada invitación por **link, QR descargable o WhatsApp** con mensaje armado
- Buscar, filtrar por estado y **exportar a Excel (CSV)**
- Generar un link nuevo si se compartió por error (el anterior deja de funcionar)
- Lista de regalos con **fotos** (se comprimen solas en el navegador), unidades repetidas, duplicar, reordenar
- Ver quién apartó cada regalo y liberar una reserva
- **Co-administradores**: el creador los agrega por correo; pueden editar todo menos borrar la fiesta

**Invitado** (`/i/:token`, sin cuenta)
- Ve la invitación con su nombre, fecha, lugar y mapa
- Confirma o declina; si es grupo, indica cuántos asistirán
- Al aceptar ve la lista de regalos y aparta **uno**; puede cambiarlo
- Los regalos de otros aparecen como "Apartado", sin nombre
- Si declina, su regalo se libera automáticamente
- Pasada la fecha límite, todo queda en solo lectura
- Vista previa con título de la fiesta al compartir el link por WhatsApp

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Aplica las migraciones, en orden:
   - **CLI**: `npx supabase link --project-ref <ref>` y luego `npx supabase db push`
   - **Manual**: pega cada archivo de `supabase/migrations/` en el SQL Editor, del 1 al 4
3. Supabase → Authentication → URL Configuration:
   - Site URL: `http://localhost:3000` (luego tu dominio)
   - Redirect URLs: agrega `http://localhost:3000/confirm` (y la de tu dominio)
   - Si quieres que los usuarios entren sin confirmar el correo, desactiva "Confirm email" en Authentication → Providers → Email
4. Copia `.env.example` a `.env` y completa las claves (Project Settings → API).
5. Instala y levanta:

```bash
npm install
npm run dev
```

### Configuración

| Variable | Para qué |
|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NUXT_PUBLIC_SUPABASE_KEY` | Publishable / anon key (va al navegador) |
| `NUXT_SUPABASE_SECRET_KEY` | Secret / service_role key (**solo servidor**) |
| `NUXT_PUBLIC_SITE_URL` | Dominio público para los links y QR. Vacío = el dominio desde donde se abre el panel |
| `NUXT_PUBLIC_TIME_ZONE` | Zona horaria de las fiestas. Por defecto `America/Santiago` |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | Revisión de tipos (incluye templates) |
| `npm run test:db` | Migraciones en un Postgres en memoria + 59 pruebas de reglas y seguridad |
| `npm run db:types` | Regenera `shared/types/database.types.ts` desde tu proyecto vinculado |

## Estructura

```
app/
  pages/
    index.vue               Portada
    login.vue, registro.vue, confirm.vue
    admin/index.vue         Mis fiestas
    admin/fiestas/[id].vue  Panel de la fiesta (pestañas)
    i/[token].vue           Invitación pública
  components/
    party/                  Formulario, resumen, administradores, ajustes
    invitation/             Lista, formulario, compartir (QR/WhatsApp), estado
    gift/                   Lista y formulario de regalos
  composables/
    usePartyAdmin.ts        Carga fiesta + invitaciones + regalos + reservas
    useGiftPhotos.ts        Subida y limpieza de fotos
  utils/                    Fechas (zona fija), errores, compresión de imágenes
server/
  api/i/[token]/            API del invitado (única vía a la BD para invitados)
  utils/guest.ts
shared/types/               Tipos compartidos
supabase/
  migrations/               Esquema, RLS, funciones de invitado, storage
  tests/rules.test.mjs
```

## Modelo de seguridad

- **Administradores** usan Supabase Auth. RLS limita cada tabla a las fiestas que administran.
- **Invitados** no tienen cuenta: su link contiene un token aleatorio de 32 caracteres. El navegador nunca consulta Supabase directamente; llama a `/api/i/:token/*` y el servidor ejecuta las funciones `guest_*` con la secret key.
- El rol `anon` no tiene acceso a ninguna tabla ni función.
- La página del invitado no se indexa en buscadores y no envía el token a sitios externos (mapas, tiendas).

## Reglas de negocio (aplicadas en la base de datos)

| Regla | Dónde |
|---|---|
| Solo el creador asigna co-admins y puede borrar la fiesta | RLS + `add_party_admin` |
| Un regalo lo aparta una sola invitación | `UNIQUE (gift_id)` |
| Una invitación aparta un solo regalo (el grupo regala uno) | `UNIQUE (invitation_id)` |
| Cambiar de regalo es atómico: si el nuevo está tomado, conserva el anterior | `guest_reserve_gift` |
| Solo aparta quien aceptó; al declinar, el regalo se libera | función + trigger |
| Pasada la fecha límite no se puede responder ni cambiar el regalo | `_guest_assert_open` |
| Los invitados ven "apartado", nunca quién | `guest_list_gifts` |
| El admin no puede cambiar la respuesta de un invitado | permisos por columna |

## Ideas para después

- Diseños de invitación por fiesta (colores, portada, tipo de evento)
- Recordatorio automático a quienes no han respondido
- Límite de peticiones en la API pública (por ejemplo, en el proxy o en Vercel)
