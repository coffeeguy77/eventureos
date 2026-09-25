-- =====================================================================
-- EventureOS 0009 — invoices: atomic manual payment recording.
-- Additive only.
-- =====================================================================

-- Record a manual payment against an invoice in one transaction:
--   lock the invoice → validate → insert payment → update amount_paid/status → audit log.
-- SECURITY INVOKER: every statement runs as the signed-in user, so RLS still
-- enforces tenancy. Xero-managed invoices are rejected (Xero is authoritative).
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_paid_at    timestamptz,
  p_method     text,
  p_reference  text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  inv        public.invoices%rowtype;
  v_amount   numeric(12,2);
  v_paid     numeric(12,2);
  v_status   public.invoice_status;
  v_payment  uuid;
  v_actor    text;
begin
  if uid is null then
    raise exception 'You must be signed in to record a payment';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be more than zero';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount <> p_amount then
    raise exception 'Payment amount can have at most two decimal places';
  end if;
  if p_paid_at is null then
    raise exception 'Payment date is required';
  end if;
  if p_paid_at > now() + interval '1 day' then
    raise exception 'Payment date cannot be in the future';
  end if;

  -- Lock the row so two people can't record against the same balance at once.
  -- (RLS applies: an invoice in another organisation is simply "not found".)
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if not public.is_org_manager(inv.organisation_id) then
    raise exception 'Only owners, admins and managers can record payments';
  end if;
  if inv.xero_invoice_id is not null then
    raise exception 'Invoice % is managed in Xero — record the payment in Xero and it will sync back', inv.number;
  end if;
  if inv.status = 'void' then
    raise exception 'Invoice % is void — payments cannot be recorded against it', inv.number;
  end if;
  if inv.status = 'paid' or inv.balance <= 0 then
    raise exception 'Invoice % is already paid in full', inv.number;
  end if;
  if v_amount > inv.balance then
    raise exception 'Payment of % is more than the balance owing (%) on %',
      to_char(v_amount, 'FM$999,999,990.00'), to_char(inv.balance, 'FM$999,999,990.00'), inv.number;
  end if;

  insert into public.payments (organisation_id, invoice_id, amount, paid_at, method, reference, created_by)
  values (inv.organisation_id, inv.id, v_amount, p_paid_at,
          nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_reference, '')), ''), uid)
  returning id into v_payment;

  v_paid := inv.amount_paid + v_amount;
  v_status := case
    when v_paid >= inv.total then 'paid'::public.invoice_status
    when inv.due_date is not null and inv.due_date < public.org_today(inv.organisation_id) then 'overdue'::public.invoice_status
    else 'part_paid'::public.invoice_status
  end;

  update public.invoices set amount_paid = v_paid, status = v_status where id = inv.id;

  select coalesce(full_name, email) into v_actor from public.users where id = uid;

  insert into public.activity_logs (organisation_id, actor_id, actor_type, action, entity_type, entity_id,
                                    customer_id, event_id, summary, changes, metadata)
  values (inv.organisation_id, uid, 'user', 'payment.received', 'invoice', inv.id, inv.customer_id, inv.event_id,
          'Payment received — ' || to_char(v_amount, 'FM$999,999,990.00') || ' on ' || inv.number
            || coalesce(' (recorded by ' || v_actor || ')', ''),
          jsonb_build_object('amount_paid', jsonb_build_array(inv.amount_paid, v_paid),
                             'status', jsonb_build_array(inv.status, v_status)),
          jsonb_build_object('payment_id', v_payment, 'amount', v_amount, 'method', p_method, 'reference', p_reference));

  return v_payment;
end $$;

revoke all on function public.record_payment(uuid, numeric, timestamptz, text, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, timestamptz, text, text) to authenticated;
