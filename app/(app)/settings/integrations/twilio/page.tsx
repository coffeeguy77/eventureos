import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Label } from "@/components/ui/form";
import { ActionButton, ActionForm, SubmitButton } from "../../forms";
import { connectTwilio, disconnectTwilio } from "./actions";

export const metadata = { title: "Text messages (Twilio)" };

export default async function TwilioPage() {
  const { supabase, org } = await requireOrg();
  const { data: t } = await supabase.from("integrations").select("status, account_label, settings").eq("organisation_id", org.id).eq("provider", "twilio").maybeSingle();
  const on = t?.status === "connected";
  return (
    <>
      <Link href="/settings/integrations" className="text-[0.75rem] text-ink-muted hover:underline">← Integrations</Link>
      <PageHeader title="Text messages (Twilio)" subtitle="Text customers from Accounts — reminders, statement links and payment-plan schedules — from your approved sender name." />
      <Card>
        <CardHeader title="Your Twilio account" subtitle={on ? t?.account_label ?? undefined : "Not connected"} action={<Badge tone={on ? "green" : "neutral"} dot>{on ? "Connected" : "Not connected"}</Badge>} />
        <div className="border-t border-line px-5 py-4">
          <ActionForm action={connectTwilio} resetOnOk>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="tw-sid" hint="Twilio console home page, starts with AC">Account SID</Label><Input id="tw-sid" name="sid" autoComplete="off" required /></div>
              <div><Label htmlFor="tw-tok" hint="next to the Account SID — click Show">Auth token</Label><Input id="tw-tok" name="token" type="password" autoComplete="off" required /></div>
              <div className="sm:col-span-2"><Label htmlFor="tw-snd" hint="your approved sender name (max 11 characters, e.g. BeanCulture), a Twilio number, or a Messaging Service SID">Sends as</Label>
                <Input id="tw-snd" name="sender" defaultValue={String(((t?.settings ?? {}) as Record<string, unknown>).sender ?? "")} maxLength={34} required /></div>
            </div>
            <p className="mt-3 text-[0.75rem] text-ink-faint">Replies can&apos;t come back to a sender name — the message says to call or email. Only mobile numbers can get texts.</p>
            <div className="mt-4 flex justify-end"><SubmitButton pendingLabel="Checking with Twilio…">{on ? "Update" : "Connect"}</SubmitButton></div>
          </ActionForm>
          {on && <div className="mt-3 border-t border-line pt-3"><ActionButton action={disconnectTwilio} variant="ghost" confirm="Stop sending texts from EventureOS?">Disconnect</ActionButton></div>}
        </div>
      </Card>
    </>
  );
}
