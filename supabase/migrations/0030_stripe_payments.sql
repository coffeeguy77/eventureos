-- Card payments through the business's own Stripe account.
--
-- * Every invoice gets an unguessable pay_token → https://…/pay/<token> (no login needed; shows only what's on the invoice).
-- * The Stripe secret key and webhook signing secret live in integration_credentials (provider 'stripe'), never readable by clients.
-- * A paid Stripe Checkout is recorded by the webhook (service role) with record_stripe_payment():
--     - invoices managed in Xero: the payment is sent to Xero against the org's Stripe clearing account first, then recorded
--       here with that Xero PaymentID (so the next Xero sync updates the same row instead of duplicating it);
--     - EventureOS-only invoices: recorded here directly.
--   Idempotent on the Stripe PaymentIntent id.

alter table public.invoices
  add column if not exists pay_token text;
update public.invoices set pay_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') where pay_token is null;
alter table public.invoices
  alter column pay_token set default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  alter column pay_token set not null;
create unique index if not exists invoices_pay_token on public.invoices (pay_token);

alter table public.payments
  add column if not exists stripe_payment_intent text,
  add column if not exists xero_push_error text;
create unique index if not exists payments_stripe_pi on public.payments (organisation_id, stripe_payment_intent) where stripe_payment_intent is not null;

-- Called only by the server (service role) from the Stripe webhook.
create or replace function public.record_stripe_payment(
  p_invoice_id uuid, p_amount numeric, p_paid_at timestamptz, p_payment_intent text, p_payer text,
  p_xero_payment_id text, p_xero_error text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  inv public.invoices%rowtype;
  v_amount numeric(12,2) := round(p_amount, 2);
  v_paid numeric(12,2);
  v_status public.invoice_status;
  v_payment uuid;
  v_cust text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  select id into v_payment from public.payments where organisation_id = inv.organisation_id and stripe_payment_intent = p_payment_intent;
  if v_payment is not null then return jsonb_build_object('payment_id', v_payment, 'duplicate', true); end if;

  insert into public.payments (organisation_id, invoice_id, amount, paid_at, method, reference, xero_payment_id, stripe_payment_intent, xero_push_error)
  values (inv.organisation_id, inv.id, v_amount, coalesce(p_paid_at, now()), 'Stripe', p_payment_intent, p_xero_payment_id, p_payment_intent, p_xero_error)
  returning id into v_payment;

  v_paid := inv.amount_paid + v_amount;
  v_status := case when v_paid >= inv.total then 'paid'::public.invoice_status
                   when v_paid > 0 then 'part_paid'::public.invoice_status else inv.status end;
  update public.invoices set amount_paid = least(v_paid, inv.total), status = v_status where id = inv.id;

  select name into v_cust from public.customers where id = inv.customer_id;
  insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary, metadata)
  values (inv.organisation_id, 'system', 'Stripe', 'payment.received', 'invoice', inv.id, inv.customer_id, inv.event_id,
          coalesce(p_payer, v_cust, 'Customer') || ' paid ' || to_char(v_amount, 'FM$999,999,990.00') || ' by card on invoice ' || coalesce(inv.number, '')
            || case when p_xero_payment_id is not null then ' — added to Xero' when p_xero_error is not null then ' — NOT in Xero yet: ' || left(p_xero_error, 160) else '' end,
          jsonb_build_object('payment_intent', p_payment_intent, 'xero_payment_id', p_xero_payment_id));
  insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
  select inv.organisation_id, ou.user_id, 'payment.received',
         coalesce(v_cust, 'A customer') || ' paid ' || to_char(v_amount, 'FM$999,999,990.00') || ' by card',
         'Invoice ' || coalesce(inv.number, '') || case when v_status = 'paid' then ' is now paid in full.' else ' — ' || to_char(inv.total - least(v_paid, inv.total), 'FM$999,999,990.00') || ' still owing.' end
           || case when p_xero_error is not null then ' Not added to Xero yet (' || left(p_xero_error, 120) || ') — EventureOS will retry on the next Xero sync.' else '' end,
         '/invoices/' || inv.id, 'invoice', inv.id
  from public.organisation_users ou where ou.organisation_id = inv.organisation_id and ou.role in ('owner','admin','manager');

  return jsonb_build_object('payment_id', v_payment, 'status', v_status);
end $$;
revoke all on function public.record_stripe_payment(uuid, numeric, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_stripe_payment(uuid, numeric, timestamptz, text, text, text, text) to service_role;

-- The customer portal can ask whether card payments are available (without seeing the integration).
create or replace function public.org_card_payments(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.integrations where organisation_id = p_org and provider = 'stripe' and status = 'connected');
$$;
revoke all on function public.org_card_payments(uuid) from public, anon;
grant execute on function public.org_card_payments(uuid) to authenticated;
