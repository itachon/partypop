-- =====================================================================
-- Seguridad para administradores: helpers, RLS, permisos de columnas
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers (security definer para no caer en recursión de RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_party_owner(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parties
    where id = p_party_id and owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_party_admin(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parties
    where id = p_party_id and owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.party_admins
    where party_id = p_party_id and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_party_owner(uuid) from public, anon;
revoke all on function public.is_party_admin(uuid) from public, anon;
grant execute on function public.is_party_owner(uuid) to authenticated;
grant execute on function public.is_party_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Activar RLS en todo
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.parties           enable row level security;
alter table public.party_admins      enable row level security;
alter table public.invitations       enable row level security;
alter table public.gifts             enable row level security;
alter table public.gift_reservations enable row level security;

-- anon no toca ninguna tabla
revoke all on public.profiles, public.parties, public.party_admins,
              public.invitations, public.gifts, public.gift_reservations
  from anon;

-- Partimos de cero para authenticated y damos solo lo necesario
revoke all on public.profiles, public.parties, public.party_admins,
              public.invitations, public.gifts, public.gift_reservations
  from authenticated;

-- ---------------------------------------------------------------------
-- profiles: ves el tuyo y el de quienes administran fiestas contigo
-- ---------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.parties p
      left join public.party_admins pa on pa.party_id = p.id
      where (p.owner_id = profiles.id or pa.user_id = profiles.id)
        and public.is_party_admin(p.id)
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- parties
--   crear: cualquier usuario (queda como dueño)
--   ver/editar: dueño o co-admin
--   borrar: solo el dueño
--   owner_id no es editable
-- ---------------------------------------------------------------------
grant select, insert, delete on public.parties to authenticated;
grant update (name, description, location, event_at, rsvp_deadline)
  on public.parties to authenticated;

-- Nota: se compara owner_id directo además del helper, porque en un
-- INSERT ... RETURNING (insert().select() en supabase-js) el helper
-- todavía no ve la fila recién creada.
create policy parties_select on public.parties
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_party_admin(id));

create policy parties_insert on public.parties
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy parties_update on public.parties
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_party_admin(id))
  with check (owner_id = (select auth.uid()) or public.is_party_admin(id));

create policy parties_delete on public.parties
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- party_admins
--   ver: cualquier admin de esa fiesta
--   agregar/quitar: solo el dueño (agregar se hace con add_party_admin
--   porque hay que buscar al usuario por email)
--   Un co-admin puede quitarse a sí mismo (salir de la fiesta)
-- ---------------------------------------------------------------------
grant select, delete on public.party_admins to authenticated;

create policy party_admins_select on public.party_admins
  for select to authenticated
  using (public.is_party_admin(party_id));

create policy party_admins_delete on public.party_admins
  for delete to authenticated
  using (public.is_party_owner(party_id) or user_id = (select auth.uid()));

create or replace function public.add_party_admin(p_party_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not public.is_party_owner(p_party_id) then
    raise exception 'Solo el creador de la fiesta puede asignar administradores'
      using errcode = '42501';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'No existe un usuario registrado con ese correo'
      using errcode = 'P0002';
  end if;

  if v_user_id = (select auth.uid()) then
    raise exception 'Ya eres el creador de esta fiesta'
      using errcode = 'P0001';
  end if;

  insert into public.party_admins (party_id, user_id)
  values (p_party_id, v_user_id)
  on conflict do nothing;

  return v_user_id;
end;
$$;

revoke all on function public.add_party_admin(uuid, text) from public, anon;
grant execute on function public.add_party_admin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- invitations
--   El admin edita nombre, cupo y nota. El estado y la respuesta
--   los escribe solo el invitado (vía funciones guest_*).
-- ---------------------------------------------------------------------
grant select, delete on public.invitations to authenticated;
grant insert (party_id, guest_name, max_guests, notes)
  on public.invitations to authenticated;
grant update (guest_name, max_guests, notes)
  on public.invitations to authenticated;

create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_party_admin(party_id));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.is_party_admin(party_id));

create policy invitations_update on public.invitations
  for update to authenticated
  using (public.is_party_admin(party_id))
  with check (public.is_party_admin(party_id));

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.is_party_admin(party_id));

-- Regenerar el link de una invitación (invalida el anterior)
create or replace function public.regenerate_invitation_token(p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  update public.invitations i
  set token = replace(gen_random_uuid()::text, '-', '')
  where i.id = p_invitation_id
    and public.is_party_admin(i.party_id)
  returning i.token into v_token;

  if v_token is null then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;

  return v_token;
end;
$$;

revoke all on function public.regenerate_invitation_token(uuid) from public, anon;
grant execute on function public.regenerate_invitation_token(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- gifts
-- ---------------------------------------------------------------------
grant select, delete on public.gifts to authenticated;
grant insert (party_id, name, description, photo_path, purchase_url, sort_order)
  on public.gifts to authenticated;
grant update (name, description, photo_path, purchase_url, sort_order)
  on public.gifts to authenticated;

create policy gifts_select on public.gifts
  for select to authenticated
  using (public.is_party_admin(party_id));

create policy gifts_insert on public.gifts
  for insert to authenticated
  with check (public.is_party_admin(party_id));

create policy gifts_update on public.gifts
  for update to authenticated
  using (public.is_party_admin(party_id))
  with check (public.is_party_admin(party_id));

create policy gifts_delete on public.gifts
  for delete to authenticated
  using (public.is_party_admin(party_id));

-- ---------------------------------------------------------------------
-- gift_reservations
--   El admin (organizador) puede ver quién aparta qué y liberar una
--   reserva. Crear reservas: solo el invitado vía guest_reserve_gift.
-- ---------------------------------------------------------------------
grant select, delete on public.gift_reservations to authenticated;

create policy gift_reservations_select on public.gift_reservations
  for select to authenticated
  using (public.is_party_admin(party_id));

create policy gift_reservations_delete on public.gift_reservations
  for delete to authenticated
  using (public.is_party_admin(party_id));
