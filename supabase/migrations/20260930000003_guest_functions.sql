-- =====================================================================
-- Funciones para invitados (sin cuenta)
-- ---------------------------------------------------------------------
-- Solo las ejecuta el rol service_role, es decir, el servidor Nuxt.
-- Nunca se exponen al navegador. Todas reciben el token del link.
--
-- Errores (en el campo "message" de la excepción, para mapearlos
-- en el servidor a textos amigables):
--   INVITATION_NOT_FOUND  token inválido
--   DEADLINE_PASSED       pasó la fecha límite de confirmación
--   INVALID_STATUS        estado distinto de accepted/declined
--   INVALID_GUESTS        cantidad de asistentes fuera de rango
--   NOT_ACCEPTED          intenta apartar regalo sin haber aceptado
--   GIFT_NOT_FOUND        el regalo no existe o es de otra fiesta
--   GIFT_TAKEN            otro invitado ya apartó ese regalo
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper interno: busca la invitación por token y bloquea la fila
-- (serializa acciones concurrentes de un mismo invitado)
-- ---------------------------------------------------------------------
create or replace function public._guest_lock_invitation(p_token text)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_inv
  from public.invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_inv;
end;
$$;

create or replace function public._guest_assert_open(p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.parties
    where id = p_party_id and now() > rsvp_deadline
  ) then
    raise exception 'DEADLINE_PASSED' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Ver invitación + fiesta
-- ---------------------------------------------------------------------
create or replace function public.guest_get_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'invitation', jsonb_build_object(
      'guest_name',       i.guest_name,
      'max_guests',       i.max_guests,
      'is_group',         i.max_guests > 1,
      'status',           i.status,
      'confirmed_guests', i.confirmed_guests,
      'responded_at',     i.responded_at
    ),
    'party', jsonb_build_object(
      'name',          p.name,
      'description',   p.description,
      'location',      p.location,
      'event_at',      p.event_at,
      'rsvp_deadline', p.rsvp_deadline
    ),
    'is_open',     now() <= p.rsvp_deadline,
    'has_gifts',   exists (select 1 from public.gifts g where g.party_id = p.id),
    'my_gift_id',  (select r.gift_id from public.gift_reservations r
                    where r.invitation_id = i.id)
  )
  into v_result
  from public.invitations i
  join public.parties p on p.id = i.party_id
  where i.token = p_token;

  if v_result is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Aceptar / declinar (se puede cambiar hasta la fecha límite).
-- Al declinar, el trigger libera el regalo automáticamente.
-- ---------------------------------------------------------------------
create or replace function public.guest_respond(
  p_token            text,
  p_status           public.invitation_status,
  p_confirmed_guests int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
begin
  v_inv := public._guest_lock_invitation(p_token);
  perform public._guest_assert_open(v_inv.party_id);

  if p_status is null or p_status not in ('accepted', 'declined') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  if p_status = 'accepted' then
    -- Invitación individual: siempre 1
    if v_inv.max_guests = 1 then
      p_confirmed_guests := 1;
    end if;
    if p_confirmed_guests is null
       or p_confirmed_guests < 1
       or p_confirmed_guests > v_inv.max_guests then
      raise exception 'INVALID_GUESTS' using errcode = 'P0001';
    end if;
  else
    p_confirmed_guests := null;
  end if;

  update public.invitations
  set status           = p_status,
      confirmed_guests = p_confirmed_guests,
      responded_at     = now()
  where id = v_inv.id;

  return public.guest_get_invitation(p_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Lista de regalos: sin nombres de quién reservó.
--   reserved = alguien lo apartó
--   mine     = lo apartó esta invitación
-- ---------------------------------------------------------------------
create or replace function public.guest_list_gifts(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv_id   uuid;
  v_party_id uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select id, party_id into v_inv_id, v_party_id
  from public.invitations
  where token = p_token;

  if v_inv_id is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',           g.id,
        'name',         g.name,
        'description',  g.description,
        'photo_path',   g.photo_path,
        'purchase_url', g.purchase_url,
        'reserved',     r.gift_id is not null,
        'mine',         coalesce(r.invitation_id = v_inv_id, false)
      )
      order by g.sort_order, g.created_at
    )
    from public.gifts g
    left join public.gift_reservations r on r.gift_id = g.id
    where g.party_id = v_party_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- Apartar un regalo. Si ya tenía uno, lo cambia (atómico: si el nuevo
-- está tomado, conserva el anterior).
-- ---------------------------------------------------------------------
create or replace function public.guest_reserve_gift(p_token text, p_gift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
begin
  v_inv := public._guest_lock_invitation(p_token);
  perform public._guest_assert_open(v_inv.party_id);

  if v_inv.status <> 'accepted' then
    raise exception 'NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.gifts
    where id = p_gift_id and party_id = v_inv.party_id
  ) then
    raise exception 'GIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Ya es suyo: nada que hacer
  if exists (
    select 1 from public.gift_reservations
    where gift_id = p_gift_id and invitation_id = v_inv.id
  ) then
    return public.guest_list_gifts(p_token);
  end if;

  begin
    delete from public.gift_reservations where invitation_id = v_inv.id;
    insert into public.gift_reservations (gift_id, invitation_id, party_id)
    values (p_gift_id, v_inv.id, v_inv.party_id);
  exception
    when unique_violation then
      raise exception 'GIFT_TAKEN' using errcode = 'P0001';
  end;

  return public.guest_list_gifts(p_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Liberar su regalo (sin elegir otro)
-- ---------------------------------------------------------------------
create or replace function public.guest_release_gift(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
begin
  v_inv := public._guest_lock_invitation(p_token);
  perform public._guest_assert_open(v_inv.party_id);

  delete from public.gift_reservations where invitation_id = v_inv.id;

  return public.guest_list_gifts(p_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos: solo service_role (servidor Nuxt)
-- ---------------------------------------------------------------------
revoke all on function public._guest_lock_invitation(text)                              from public, anon, authenticated;
revoke all on function public._guest_assert_open(uuid)                                  from public, anon, authenticated;
revoke all on function public.guest_get_invitation(text)                                from public, anon, authenticated;
revoke all on function public.guest_respond(text, public.invitation_status, int)        from public, anon, authenticated;
revoke all on function public.guest_list_gifts(text)                                    from public, anon, authenticated;
revoke all on function public.guest_reserve_gift(text, uuid)                            from public, anon, authenticated;
revoke all on function public.guest_release_gift(text)                                  from public, anon, authenticated;

grant execute on function public.guest_get_invitation(text)                             to service_role;
grant execute on function public.guest_respond(text, public.invitation_status, int)     to service_role;
grant execute on function public.guest_list_gifts(text)                                 to service_role;
grant execute on function public.guest_reserve_gift(text, uuid)                         to service_role;
grant execute on function public.guest_release_gift(text)                               to service_role;
