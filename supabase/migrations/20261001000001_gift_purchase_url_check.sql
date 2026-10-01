-- =====================================================================
-- Link de compra de regalos: solo http(s)
-- ---------------------------------------------------------------------
-- El formulario ya lo valida, pero un admin podría saltárselo llamando
-- a Supabase directo y guardar un link "javascript:..." que se ejecutaría
-- al hacer clic en la página del invitado. La base es la barrera real.
-- =====================================================================

-- Limpia links inválidos que ya existan para poder crear la restricción
update public.gifts
set purchase_url = null
where purchase_url is not null
  and purchase_url !~* '^https?://[^[:space:]]+$';

alter table public.gifts
  add constraint gifts_purchase_url_http
  check (purchase_url is null or purchase_url ~* '^https?://[^[:space:]]+$');
