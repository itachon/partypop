// Prueba las migraciones contra Postgres real (PGlite) con un stub de Supabase
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

const MIG = path.join(path.dirname(new URL(import.meta.url).pathname), '../migrations')
const db = new PGlite()

// ---- Stub mínimo de Supabase: roles, auth, storage, grants por defecto ----
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant all on storage.objects to authenticated;
`)

for (const f of fs.readdirSync(MIG).sort()) {
  try { await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8')); console.log('✔ migración', f) }
  catch (e) { console.error('✘ migración', f, e.message); process.exit(1) }
}

// ---- helpers ----
let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✔', name) } else { fail++; console.log('  ✘', name, extra) }
}
async function as(role, uid, sql, params = []) {
  await db.exec(`set role ${role}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  try { return await db.query(sql, params) }
  finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`) }
}
async function err(role, uid, sql, params = []) {
  try { await as(role, uid, sql, params); return null } catch (e) { return e.message }
}
const svc = (sql, params) => as('service_role', null, sql, params)
const svcErr = (sql, params) => err('service_role', null, sql, params)
const gget = async (t) => (await svc('select public.guest_get_invitation($1) r', [t])).rows[0].r
const glist = async (t) => (await svc('select public.guest_list_gifts($1) r', [t])).rows[0].r

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'

console.log('\nUsuarios y perfiles')
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
  ($1,'ana@x.cl','{"full_name":"Ana"}'), ($2,'beto@x.cl','{}'), ($3,'caro@x.cl','{}')`, [A, B, C])
check('perfil creado por trigger', (await db.query('select count(*)::int n from public.profiles')).rows[0].n === 3)

console.log('\nFiestas y co-administradores')
const party = (await as('authenticated', A, `insert into public.parties (name, event_at, rsvp_deadline)
  values ('Cumple Sofi', now() + interval '10 days', now() + interval '5 days') returning id, owner_id`)).rows[0]
check('A crea fiesta y queda como dueña', party.owner_id === A)
check('B no ve la fiesta', (await as('authenticated', B, 'select * from public.parties')).rows.length === 0)
check('anon no puede leer fiestas', /permission denied/.test(await err('anon', null, 'select * from public.parties')))
check('B no puede asignarse admin', /Solo el creador/.test(await err('authenticated', B, 'select public.add_party_admin($1,$2)', [party.id, 'beto@x.cl'])))
check('correo inexistente da error', /No existe/.test(await err('authenticated', A, 'select public.add_party_admin($1,$2)', [party.id, 'nadie@x.cl'])))
await as('authenticated', A, 'select public.add_party_admin($1,$2)', [party.id, 'BETO@x.cl'])
check('A agrega a B por correo (sin importar mayúsculas)', (await as('authenticated', B, 'select * from public.parties')).rows.length === 1)
check('B (co-admin) no puede agregar a C', /Solo el creador/.test(await err('authenticated', B, 'select public.add_party_admin($1,$2)', [party.id, 'caro@x.cl'])))
await as('authenticated', B, `update public.parties set name = 'Cumple Sofi 7' where id = $1`, [party.id])
check('B puede editar la fiesta', (await db.query('select name from public.parties')).rows[0].name === 'Cumple Sofi 7')
check('nadie puede cambiar owner_id', /permission denied/.test(await err('authenticated', A, 'update public.parties set owner_id = $2 where id = $1', [party.id, B])))
await as('authenticated', B, 'delete from public.parties where id = $1', [party.id])
check('B no puede borrar la fiesta', (await db.query('select count(*)::int n from public.parties')).rows[0].n === 1)
check('B ve el perfil de A', (await as('authenticated', B, 'select * from public.profiles where id = $1', [A])).rows.length === 1)
check('C no ve perfiles ajenos', (await as('authenticated', C, 'select * from public.profiles')).rows.length === 1)
check('C no ve la fiesta', (await as('authenticated', C, 'select * from public.parties')).rows.length === 0)

console.log('\nInvitaciones y regalos (admin)')
const inv = (await as('authenticated', A, `insert into public.invitations (party_id, guest_name, max_guests) values
  ($1,'Juan',1), ($1,'Familia Pérez',4), ($1,'Lucía',1) returning id, token, guest_name`, [party.id])).rows
const [tJuan, tPerez, tLucia] = inv.map(r => r.token)
check('token de 32 hex', /^[0-9a-f]{32}$/.test(tJuan))
check('C no puede crear invitaciones en fiesta ajena', /row-level security/.test(await err('authenticated', C, `insert into public.invitations (party_id, guest_name) values ($1,'x')`, [party.id])))
check('admin no puede cambiar el estado de una invitación', /permission denied/.test(await err('authenticated', A, `update public.invitations set status='accepted' where party_id=$1`, [party.id])))
const gifts = (await as('authenticated', B, `insert into public.gifts (party_id, name, sort_order) values
  ($1,'Lego',1), ($1,'Libro',2), ($1,'Libro',3) returning id`, [party.id])).rows.map(r => r.id)
check('B crea regalos (incluye repetidos)', gifts.length === 3)
const tOld = tLucia
const tNew = (await as('authenticated', A, 'select public.regenerate_invitation_token($1) t', [inv[2].id])).rows[0].t
check('regenerar token invalida el anterior', tNew !== tOld && /INVITATION_NOT_FOUND/.test(await svcErr('select public.guest_get_invitation($1)', [tOld])))

console.log('\nAcceso de invitados')
check('authenticated no puede llamar funciones guest', /permission denied/.test(await err('authenticated', A, 'select public.guest_get_invitation($1)', [tJuan])))
check('anon no puede llamar funciones guest', /permission denied/.test(await err('anon', null, 'select public.guest_get_invitation($1)', [tJuan])))
check('token inválido', /INVITATION_NOT_FOUND/.test(await svcErr('select public.guest_get_invitation($1)', ['abc'])))
const g0 = await gget(tJuan)
check('invitado ve su invitación y la fiesta', g0.party.name === 'Cumple Sofi 7' && g0.invitation.status === 'pending' && g0.has_gifts && g0.is_open)
check('el invitado no recibe la nota interna ni ids', !('notes' in g0.invitation) && !('id' in g0.invitation))
check('no puede apartar sin aceptar', /NOT_ACCEPTED/.test(await svcErr('select public.guest_reserve_gift($1,$2)', [tJuan, gifts[0]])))
const r1 = (await svc('select public.guest_respond($1,$2,$3) r', [tJuan, 'accepted', null])).rows[0].r
check('individual acepta → 1 persona', r1.invitation.status === 'accepted' && r1.invitation.confirmed_guests === 1)
check('grupo no puede confirmar 5 de 4', /INVALID_GUESTS/.test(await svcErr('select public.guest_respond($1,$2,$3)', [tPerez, 'accepted', 5])))
check('grupo debe indicar cantidad', /INVALID_GUESTS/.test(await svcErr('select public.guest_respond($1,$2,$3)', [tPerez, 'accepted', null])))
const r2 = (await svc('select public.guest_respond($1,$2,$3) r', [tPerez, 'accepted', 3])).rows[0].r
check('grupo confirma 3 de 4', r2.invitation.confirmed_guests === 3 && r2.invitation.is_group)

console.log('\nReserva de regalos')
let l = (await svc('select public.guest_reserve_gift($1,$2) r', [tJuan, gifts[0]])).rows[0].r
check('Juan aparta el Lego', l.find(g => g.id === gifts[0]).mine === true)
check('Pérez no puede apartar el mismo Lego', /GIFT_TAKEN/.test(await svcErr('select public.guest_reserve_gift($1,$2)', [tPerez, gifts[0]])))
l = await glist(tPerez)
const lego = l.find(g => g.id === gifts[0])
check('Pérez ve el Lego como apartado, no suyo', lego.reserved === true && lego.mine === false)
check('la lista no expone nombres de quien reservó', !JSON.stringify(l).includes('Juan'))
l = (await svc('select public.guest_reserve_gift($1,$2) r', [tJuan, gifts[1]])).rows[0].r
check('Juan cambia al Libro y libera el Lego', l.find(g => g.id === gifts[1]).mine && !l.find(g => g.id === gifts[0]).reserved)
await svc('select public.guest_reserve_gift($1,$2)', [tPerez, gifts[0]])
check('Juan intenta el Lego (tomado) → error', /GIFT_TAKEN/.test(await svcErr('select public.guest_reserve_gift($1,$2)', [tJuan, gifts[0]])))
check('…y conserva su Libro (cambio atómico)', (await glist(tJuan)).find(g => g.id === gifts[1]).mine === true)
check('una sola reserva por invitación', (await db.query('select count(*)::int n from public.gift_reservations where invitation_id=$1', [inv[0].id])).rows[0].n === 1)
check('el libro repetido sigue libre', (await glist(tJuan)).find(g => g.id === gifts[2]).reserved === false)
check('reservar dos veces el suyo no falla', !(await svcErr('select public.guest_reserve_gift($1,$2)', [tJuan, gifts[1]])))

console.log('\nRetractarse')
const rd = (await svc('select public.guest_respond($1,$2,$3) r', [tJuan, 'declined', 2])).rows[0].r
check('Juan declina → confirmed_guests vacío', rd.invitation.status === 'declined' && rd.invitation.confirmed_guests === null)
check('…y su regalo se libera solo', rd.my_gift_id === null && (await glist(tPerez)).find(g => g.id === gifts[1]).reserved === false)
await svc('select public.guest_respond($1,$2,$3)', [tJuan, 'accepted', null])
check('Juan vuelve a aceptar sin regalo', (await gget(tJuan)).my_gift_id === null)
l = (await svc('select public.guest_release_gift($1) r', [tPerez])).rows[0].r
check('Pérez libera su regalo manualmente', l.every(g => !g.mine))

console.log('\nAislamiento entre fiestas')
const party2 = (await as('authenticated', C, `insert into public.parties (name, event_at, rsvp_deadline)
  values ('Otra', now() + interval '3 days', now() + interval '2 days') returning id`)).rows[0].id
const giftOther = (await as('authenticated', C, `insert into public.gifts (party_id, name) values ($1,'Bici') returning id`, [party2])).rows[0].id
check('no puede apartar regalo de otra fiesta', /GIFT_NOT_FOUND/.test(await svcErr('select public.guest_reserve_gift($1,$2)', [tJuan, giftOther])))
check('C no ve reservas de la fiesta de A', (await as('authenticated', C, 'select * from public.gift_reservations')).rows.length === 0)
check('admin no puede insertar reservas directo', /permission denied/.test(await err('authenticated', A, `insert into public.gift_reservations (gift_id, invitation_id, party_id) values ($1,$2,$3)`, [gifts[0], inv[0].id, party.id])))

console.log('\nAdmin ve quién aparta qué')
await svc('select public.guest_reserve_gift($1,$2)', [tJuan, gifts[2]])
const adm = (await as('authenticated', B, `select i.guest_name, g.name from public.gift_reservations r
  join public.invitations i on i.id = r.invitation_id join public.gifts g on g.id = r.gift_id`)).rows
check('co-admin ve la reserva de Juan', adm.length === 1 && adm[0].guest_name === 'Juan')
check('bajar cupo bajo lo confirmado falla', /confirmed_guests_valid/.test(await err('authenticated', A, 'update public.invitations set max_guests=2 where id=$1', [inv[1].id])))

console.log('\nFecha límite')
await db.query(`update public.parties set rsvp_deadline = now() - interval '1 minute' where id = $1`, [party.id])
check('is_open = false', (await gget(tJuan)).is_open === false)
check('no puede responder', /DEADLINE_PASSED/.test(await svcErr('select public.guest_respond($1,$2,$3)', [tJuan, 'declined', null])))
check('no puede cambiar regalo', /DEADLINE_PASSED/.test(await svcErr('select public.guest_reserve_gift($1,$2)', [tJuan, gifts[0]])))
check('no puede liberar regalo', /DEADLINE_PASSED/.test(await svcErr('select public.guest_release_gift($1)', [tJuan])))
check('sí puede seguir viendo la lista', (await glist(tJuan)).length === 3)
check('deadline posterior al evento rechazado', /rsvp_before_event/.test(await err('authenticated', A, `insert into public.parties (name, event_at, rsvp_deadline) values ('x', now(), now() + interval '1 day')`)))

console.log('\nStorage')
check('B sube foto a su fiesta', !(await err('authenticated', B, `insert into storage.objects (bucket_id, name) values ('gift-photos', $1)`, [`${party.id}/lego.webp`])))
check('C no puede subir a la fiesta de A', /row-level security/.test(await err('authenticated', C, `insert into storage.objects (bucket_id, name) values ('gift-photos', $1)`, [`${party.id}/x.webp`])))
check('ruta sin party_id rechazada', /row-level security/.test(await err('authenticated', A, `insert into storage.objects (bucket_id, name) values ('gift-photos', 'suelta.webp')`)))

console.log('\nSalir y borrar')
await as('authenticated', B, 'delete from public.party_admins where party_id=$1 and user_id=$2', [party.id, B])
check('co-admin puede salirse', (await as('authenticated', B, 'select * from public.parties')).rows.length === 0)
await as('authenticated', A, 'delete from public.parties where id=$1', [party.id])
check('borrar fiesta borra todo en cascada', (await db.query('select (select count(*) from public.invitations i where i.party_id=$1)::int + (select count(*) from public.gifts g where g.party_id=$1)::int n', [party.id])).rows[0].n === 0)

console.log(`\n${pass} ok, ${fail} fallidas`)
process.exit(fail ? 1 : 0)
