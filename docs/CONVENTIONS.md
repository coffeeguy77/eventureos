# EventureOS — engineering conventions (read before writing code)

## Stack
Next.js 15 App Router (server components + server actions), React 19, TypeScript strict, Tailwind 3,
Supabase (Postgres + Auth + Storage + RLS), deployed on Vercel (region syd1). No local DB access from the
dev container — the database is only reachable through the Supabase MCP tools (project id `hrarethuqwfmtewxngxt`).

## Security model (non-negotiable)
- Every query runs **as the signed-in user** via `createClient()` from `lib/supabase/server.ts`. RLS enforces tenancy.
  Never use a service-role key in request handling. Always still filter by `organisation_id = org.id` for clarity.
- Get the user + current organisation with `requireOrg()` from `lib/context.ts` → `{ supabase, org, role, user, profile, memberships }`.
  `canManage(role)` = owner/admin/manager. Staff roles: owner, admin, manager, staff. Customers use the portal only.
- Every meaningful change writes the audit trail with `logActivity(supabase, {...})` from `lib/activity.ts`
  (summary in plain English, e.g. "Sarah Mitchell changed guest count 80 → 100"; include `changes` when fields change).
- Server actions live in an `actions.ts` next to the page with `"use server"`; validate input; throw `Error` with a
  plain-English message on failure (the app prefers loud failures over silent ones). Call `revalidatePath` for affected pages.
- Integration tokens are only reachable through RPCs `get_integration_tokens`, `save_integration_connection`,
  `update_integration_access_token`, `disconnect_integration`.

## Key database objects (see supabase/migrations/*.sql for full definitions)
Tables: organisations (settings jsonb: quote_acceptance_action 'deposit_invoice'|'full_invoice'|'manual', deposit_percent,
quote_follow_up_days, default_payment_terms_days; public_form_key), organisation_users (role, title, expires_at),
organisation_invitations, users, customers, contacts (portal_user_id), enquiries, events, event_contacts, email_threads,
email_messages, quotes (draft header; status; current_version_id; has_unpublished_changes), quote_sections, quote_items
(line_total is generated), quote_versions (immutable snapshot jsonb + totals + status + acceptance fields),
calendar_connections (resources, colour, provider local|google, external_calendar_id, sync_enabled), calendar_events
(kind event|site_visit|setup|hold|other, sync_status, external_event_id), tasks, documents (storage_path in bucket
`documents`, path `<org_id>/...`; portal uploads `<org_id>/portal/...`), invoices (balance generated; xero ids),
payments, integrations (provider, status, account_label, settings jsonb, last_sync_at, last_sync_status, last_error),
integration_sync_logs, notifications, activity_logs, automation_rules, automation_runs, notes, portal_messages,
import_candidates (source gmail|xero, kind, payload, suggested_customer_id, score, reasons, status).

RPCs: publish_quote(p_quote_id) → version id; staff_record_quote_response(p_version_id, p_decision 'accepted'|'declined',
p_name, p_reason); portal_claim_access(p_slug) → {linked}; portal_branding(p_slug); portal_mark_quote_viewed(p_version_id);
portal_respond_to_quote(p_version_id, p_decision, p_name, p_reason, p_ip, p_user_agent); portal_add_document(...);
convert_enquiry_to_event(p_enquiry_id, p_event_name); capture_website_enquiry(p_slug, p_key, p_payload);
accept_my_invitations(); global_search(org, q, max_results); admin_platform_stats(); admin_organisations();
admin_set_organisation_status(p_org, p_status, p_plan); admin_start_support_session(p_org, p_reason, p_minutes);
admin_end_support_session(p_org); is_super_admin(); build_quote_snapshot(qid).
Quote acceptance automatically (if the org's `quote.accepted` automation rule is enabled): confirms the event, adds a
calendar entry, raises a deposit/full invoice per settings, notifies. pg_cron runs `run_scheduled_automations()` every
15 min (quote follow-ups, overdue invoices, expired quotes).

PostgREST embedding gotchas: quotes↔quote_versions have two relationships — use
`quote_versions!quotes_current_version_id_organisation_id_fkey(...)` from quotes and
`quotes!quote_versions_quote_id_organisation_id_fkey(...)` from quote_versions. organisation_users→users use
`users!organisation_users_user_id_fkey`. enquiries→events use `events!enquiries_event_id_organisation_id_fkey`.
events→contacts use `contacts!events_primary_contact_id_organisation_id_fkey`.

## UI conventions
- Look at `app/(app)/dashboard/page.tsx`, `app/(app)/events/[id]/page.tsx`, `app/(app)/enquiries/[id]/page.tsx` for
  the house style. Reuse `components/ui/*` (Card, CardHeader, EmptyState, Field, Badge, Button/ButtonLink, Avatar,
  Tabs (URL ?tab=), ClientTabs, PageHeader, Input/Select/Textarea/Label/FormError, DateTimeField) and
  `components/records/*` (ActivityFeed, NotesPanel, TasksPanel, Conversation, DocumentsList, NextActionBanner, FilterBar,
  Kpi, TaskCheckbox).
- `cn()` from `lib/cn.ts` merges Tailwind classes (later wins). Colours: `brand-*` (violet accent), `ink`, `ink-muted`,
  `ink-faint`, `line`, `canvas`. Text sizes are small and precise (12–14px). Rounded-xl cards, subtle borders, no
  decorative UI. Status colours from `lib/status.ts`. Money via `money()`, dates via `fmtDate/fmtDateTime/relative`
  (org timezone `org.timezone`) from `lib/format.ts`. Use `tabular` class for numbers in columns.
- Every record page shows the most likely NEXT ACTION prominently.
- Desktop-first but must work at 375px wide (tables scroll horizontally inside cards).
- Be honest in UI: when an integration isn't connected, say so plainly; never fake a sync.

## Working rules for contributors
- Only edit files you own (your brief lists them). If you need a change elsewhere, describe it in your final report.
- Do NOT add npm dependencies. Do NOT run `next build` (other people share the folder). Run `npx tsc --noEmit` and fix
  errors in your own files. Do NOT commit or push.
- DB changes: additive only (new tables/columns/functions/policies), in a new file
  `supabase/migrations/0009_<area>.sql` AND applied with the Supabase MCP `apply_migration`. RLS on every new table.
  Test with `execute_sql` inside a `do $$ ... raise exception 'RESULT %' ... $$` block so tests roll back.
  Demo users: sarah 1f8931d5-281b-5dcf-b01e-ef373ad8cbdb (owner Bean Culture, admin Copper & Tonic),
  tom 4cb89d10-2914-51a9-b533-e6b0656847df (staff), liam c52e12ff-30a5-588f-a030-e62ea15c0710 (Copper & Tonic only),
  platform admin 5c2d8cbe-f03b-502c-8292-edfce9b9f307. Impersonate with
  `perform set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role','authenticated')::text, true); execute 'set local role authenticated';`
- Don't guess external facts (API endpoints, scopes, field names): check the provider's official docs with WebFetch.
