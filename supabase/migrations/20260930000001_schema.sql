-- =====================================================================
-- Sistema de invitaciones a fiestas — esquema base
-- =====================================================================
-- Modelo de acceso:
--   * Administradores: usuarios de Supabase Auth. Acceden a sus tablas
--     vía RLS (rol "authenticated").
--   * Invitados: SIN cuenta. Nunca tocan las tablas. El servidor Nuxt
--     (Nitro) llama a las funciones guest_* con la service key,
--     pasando el token de la invitación.
--   * El rol "anon" no tiene acceso a nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.invitation_status as enum ('pending', 'accepted', 'declined');

-- ---------------------------------------------------------------------
-- Perfiles (espejo de auth.users con datos visibles)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Fiestas
-- ---------------------------------------------------------------------
create table public.parties (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid()
                   references public.profiles (id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 120),
  description    text,
  location       text,
  event_at       timestamptz not null,
  rsvp_deadline  timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rsvp_before_event check (rsvp_deadline <= event_at)
);

create index parties_owner_idx on public.parties (owner_id);

-- ---------------------------------------------------------------------
-- Co-administradores (los asigna solo el creador de la fiesta)
-- El creador NO va en esta tabla: se identifica por parties.owner_id.
-- ---------------------------------------------------------------------
create table public.party_admins (
  party_id    uuid not null references public.parties (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (party_id, user_id)
);

create index party_admins_user_idx on public.party_admins (user_id);

-- ---------------------------------------------------------------------
-- Invitaciones
--   max_guests = 1  -> invitación individual
--   max_guests > 1  -> invitación grupal (el grupo confirma cuántos van)
-- ---------------------------------------------------------------------
create table public.invitations (
  id                uuid primary key default gen_random_uuid(),
  party_id          uuid not null references public.parties (id) on delete cascade,
  guest_name        text not null check (length(trim(guest_name)) between 1 and 120),
  max_guests        int  not null default 1 check (max_guests between 1 and 50),
  -- 32 caracteres hex aleatorios (122 bits): no adivinable
  token             text not null unique
                      default replace(gen_random_uuid()::text, '-', ''),
  status            public.invitation_status not null default 'pending',
  confirmed_guests  int,
  responded_at      timestamptz,
  notes             text,       -- nota interna del admin, el invitado no la ve
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Si aceptó: entre 1 y max_guests. Si no: vacío.
  constraint confirmed_guests_valid check (
    (status = 'accepted' and confirmed_guests between 1 and max_guests)
    or (status <> 'accepted' and confirmed_guests is null)
  )
);

create index invitations_party_idx on public.invitations (party_id);

-- ---------------------------------------------------------------------
-- Regalos (cada fila es UN regalo; los repetidos son filas distintas)
-- ---------------------------------------------------------------------
create table public.gifts (
  id           uuid primary key default gen_random_uuid(),
  party_id     uuid not null references public.parties (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  description  text,
  photo_path   text,          -- ruta en el bucket "gift-photos"
  purchase_url text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index gifts_party_idx on public.gifts (party_id, sort_order);

-- ---------------------------------------------------------------------
-- Reservas de regalos
--   gift_id único       -> un regalo lo aparta una sola invitación
--   invitation_id único -> una invitación aparta un solo regalo
--   party_id se guarda para garantizar que regalo e invitación
--   pertenecen a la MISMA fiesta (FK compuestas).
-- ---------------------------------------------------------------------
alter table public.gifts       add constraint gifts_id_party_uq       unique (id, party_id);
alter table public.invitations add constraint invitations_id_party_uq unique (id, party_id);

create table public.gift_reservations (
  gift_id        uuid not null unique,
  invitation_id  uuid not null unique,
  party_id       uuid not null,
  created_at     timestamptz not null default now(),
  primary key (gift_id),
  foreign key (gift_id, party_id)
    references public.gifts (id, party_id) on delete cascade,
  foreign key (invitation_id, party_id)
    references public.invitations (id, party_id) on delete cascade
);

create index gift_reservations_party_idx on public.gift_reservations (party_id);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger parties_updated_at     before update on public.parties
  for each row execute function public.set_updated_at();
create trigger invitations_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();
create trigger gifts_updated_at       before update on public.gifts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Regla: si una invitación pasa a "declined" (o vuelve a "pending"),
-- su regalo se libera automáticamente.
-- ---------------------------------------------------------------------
create or replace function public.release_gift_when_not_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'accepted' then
    delete from public.gift_reservations where invitation_id = new.id;
  end if;
  return new;
end;
$$;

create trigger invitations_release_gift
  after update of status on public.invitations
  for each row
  when (old.status is distinct from new.status)
  execute function public.release_gift_when_not_accepted();

-- ---------------------------------------------------------------------
-- Regla: solo se puede reservar con invitación aceptada.
-- (Las funciones guest_* ya lo validan; esto es una segunda barrera.)
-- ---------------------------------------------------------------------
create or replace function public.check_reservation_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.invitations
    where id = new.invitation_id and status = 'accepted'
  ) then
    raise exception 'La invitación debe estar aceptada para apartar un regalo'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger gift_reservations_check
  before insert or update on public.gift_reservations
  for each row execute function public.check_reservation_allowed();
