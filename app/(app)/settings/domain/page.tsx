import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { readSite } from "@/lib/site/site";
import { PROVIDER_LABEL, describe, missingRecords, sameRecord } from "@/lib/domains/dns";
import { nameservers, onVercel, scanMail, vercelDomain, vercelReady, vercelRecords } from "@/lib/domains/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddRecordForm, ConnectButton, DomainForm, LiveSwitch } from "./tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Domain & email" };

/**
 * The business's own domain on EventureOS: save it, connect it (Vercel), copy the records that keep email working,
 * then change the nameservers. Reads the domain's live DNS each time the page opens.
 */
export default async function DomainSettings() {
  const { org, role } = await requireOrg();
  if (!canManage(role)) redirect("/settings");
  const isAdmin = role === "owner" || role === "admin";
  const site = readSite(org.settings);
  const domain = site.domain;
  const ready = vercelReady();

  const [ns, mail, vd, recs] = domain
    ? await Promise.all([nameservers(domain), scanMail(domain), ready ? vercelDomain(domain) : Promise.resolve(null), ready ? vercelRecords(domain).catch(() => []) : Promise.resolve([])])
    : [[], null, null, []];
  const live = domain ? onVercel(ns) : false;
  const connected = !!vd?.inProject && !!vd?.zone;
  const missing = mail ? missingRecords(mail.records, recs) : [];
  const mailRecords = mail?.records.filter((r) => !(["A", "AAAA"].includes(r.type))) ?? [];
  const step = !domain ? 1 : !connected || missing.length ? 2 : !live ? 3 : 4;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Your domain" subtitle="The address your website answers on, like yourbusiness.com.au. Your email stays with your email provider — EventureOS only copies the records that point to it." />
        <div className="space-y-4 border-t border-line px-5 py-4">
          <DomainForm initial={domain ?? ""} disabled={!isAdmin} />
          {domain && (
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { n: 1, t: "Domain saved", ok: true },
                { n: 2, t: "Connected & email records copied", ok: connected && !missing.length },
                { n: 3, t: "Nameservers changed", ok: live },
                { n: 4, t: "Main address for Google", ok: site.live },
              ].map((s) => (
                <li key={s.n} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.8125rem] ring-1 ring-inset ${s.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30" : step === s.n ? "bg-brand-50 text-ink ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30" : "bg-canvas text-ink-muted ring-line"}`}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.75rem] font-semibold ${s.ok ? "bg-emerald-600 text-white" : "bg-surface text-ink ring-1 ring-line"}`}>{s.ok ? "✓" : s.n}</span>{s.t}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>

      {domain && (
        <Card>
          <CardHeader title="Email" subtitle={mail ? `${PROVIDER_LABEL[mail.provider]} — found on ${domain} right now.` : undefined}
            action={connected && !missing.length ? <Badge tone="green">All copied</Badge> : missing.length ? <Badge tone="amber">{missing.length} to copy</Badge> : null} />
          <div className="space-y-4 border-t border-line px-5 py-4">
            {mailRecords.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[0.8125rem]">
                  <thead className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><tr><th className="py-1.5 pr-3 font-medium">What it does</th><th className="py-1.5 pr-3 font-medium">Record</th><th className="py-1.5 pr-3 font-medium">Value</th><th className="py-1.5 font-medium">On EventureOS</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {mailRecords.map((r, i) => {
                      const there = recs.some((e) => sameRecord(e, r));
                      return (
                        <tr key={i}>
                          <td className="py-2 pr-3 text-ink">{describe(r)}</td>
                          <td className="py-2 pr-3 text-ink-muted">{r.type} {r.name || "@"}</td>
                          <td className="max-w-[320px] py-2 pr-3"><span className="block truncate font-mono text-[0.75rem] text-ink-muted" title={r.value}>{r.type === "MX" ? `${r.priority} ` : ""}{r.value}</span></td>
                          <td className="py-2">{there ? <Badge tone="green">Copied</Badge> : <Badge tone="amber">Not yet</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-[0.8125rem] text-ink-muted">No email records found on {domain}.</p>}
            {!ready ? <p className="text-[0.8125rem] text-amber-700">EventureOS isn&apos;t connected to Vercel yet (VERCEL_ACCESS_TOKEN), so it can&apos;t connect domains.</p>
              : isAdmin && (!connected || missing.length > 0) ? <ConnectButton domain={domain} count={missing.length} connected={connected} /> : null}
            <p className="text-[0.75rem] text-ink-faint">Only adds records — nothing is removed or changed. Other subdomains (a second site, a booking system) aren&apos;t found automatically: add them below before changing nameservers.</p>
          </div>
        </Card>
      )}

      {domain && (
        <Card>
          <CardHeader title="Nameservers" subtitle={live ? `${domain} now uses EventureOS's DNS.` : "Last step: at the company you registered the domain with, change its nameservers to these two."} action={live ? <Badge tone="green">On EventureOS</Badge> : <Badge tone="neutral">Not yet</Badge>} />
          <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
            <div className="grid gap-2 sm:grid-cols-2">
              {["ns1.vercel-dns.com", "ns2.vercel-dns.com"].map((n) => <code key={n} className="select-all rounded-lg bg-canvas px-3 py-2 font-mono text-ink ring-1 ring-line">{n}</code>)}
            </div>
            <p className="text-ink-muted">Right now: {ns.length ? ns.join(", ") : "couldn't read them"}. {!live && step < 3 ? "Do step 2 first so your email keeps working." : !live ? "Changes can take a few hours to reach everyone." : ""}</p>
          </div>
        </Card>
      )}

      {domain && (
        <Card>
          <CardHeader title="Main address for Google" subtitle={`Tell search engines ${domain} is the address for your website pages. Switch on once the nameservers have changed.`} />
          <div className="border-t border-line px-5 py-4"><LiveSwitch on={site.live} disabled={!isAdmin || (!live && !site.live)} /></div>
        </Card>
      )}

      {domain && connected && (
        <Card>
          <CardHeader title="All DNS records" subtitle="Everything EventureOS's DNS answers for this domain. Records marked automatic are managed by EventureOS." />
          <div className="space-y-4 border-t border-line px-5 py-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[0.8125rem]">
                <thead className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><tr><th className="py-1.5 pr-3 font-medium">Type</th><th className="py-1.5 pr-3 font-medium">Name</th><th className="py-1.5 pr-3 font-medium">Value</th><th className="py-1.5 font-medium">Note</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {[...recs].sort((a, b) => Number(a.system) - Number(b.system) || a.name.localeCompare(b.name)).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3 text-ink">{r.type}</td>
                      <td className="py-2 pr-3 text-ink">{r.name ? `${r.name}.${domain}` : domain}</td>
                      <td className="max-w-[320px] py-2 pr-3"><span className="block truncate font-mono text-[0.75rem] text-ink-muted" title={r.value}>{r.type === "MX" ? `${r.priority} ` : ""}{r.value}</span></td>
                      <td className="py-2 text-ink-muted">{r.system ? "Automatic" : r.comment ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isAdmin && <AddRecordForm domain={domain} />}
          </div>
        </Card>
      )}
    </div>
  );
}
