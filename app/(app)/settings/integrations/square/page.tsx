import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Label } from "@/components/ui/form";
import { ActionButton, ActionForm, SubmitButton } from "../../forms";
import { connectSquare, disconnectSquare } from "./actions";

export const metadata = { title: "Square" };

export default async function SquarePage() {
  const { supabase, org } = await requireOrg();
  const { data: t } = await supabase.from("integrations").select("status, account_label, settings").eq("organisation_id", org.id).eq("provider", "square").maybeSingle();
  const on = t?.status === "connected";
  return (
    <>
      <Link href="/settings/integrations" className="text-[0.75rem] text-ink-muted hover:underline">← Integrations</Link>
      <PageHeader title="Square" subtitle="Read today's takings so the roster shows wages as a % of sales. EventureOS only reads payments — it never changes anything in Square." />
      <Card>
        <CardHeader title="Your Square account" subtitle={on ? t?.account_label ?? undefined : "Not connected"} action={<Badge tone={on ? "green" : "neutral"} dot>{on ? "Connected" : "Not connected"}</Badge>} />
        <div className="border-t border-line px-5 py-4">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-[0.8125rem] text-ink-muted">
            <li>Go to developer.squareup.com and sign in with your Square login.</li>
            <li>Create an application (any name, e.g. EventureOS), open it, and choose <b>Production</b> at the top.</li>
            <li>Under Credentials, copy the <b>Production access token</b> (starts with EAAA) and paste it here.</li>
          </ol>
          <ActionForm action={connectSquare} resetOnOk>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="sq-tok" hint="starts with EAAA">Production access token</Label><Input id="sq-tok" name="token" type="password" autoComplete="off" required /></div>
              <div><Label htmlFor="sq-loc" hint="only if you have more than one location">Location ID</Label><Input id="sq-loc" name="location" autoComplete="off" defaultValue={String(((t?.settings ?? {}) as Record<string, unknown>).location_id ?? "")} /></div>
            </div>
            <div className="mt-4 flex justify-end"><SubmitButton pendingLabel="Checking with Square…">{on ? "Update" : "Connect"}</SubmitButton></div>
          </ActionForm>
          {on && <div className="mt-3 border-t border-line pt-3"><ActionButton action={disconnectSquare} variant="ghost" confirm="Stop reading sales from Square?">Disconnect</ActionButton></div>}
        </div>
      </Card>
    </>
  );
}
