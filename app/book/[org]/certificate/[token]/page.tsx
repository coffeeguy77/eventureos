import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, Download } from "lucide-react";
import QRCode from "qrcode";
import { createServiceClient } from "@/lib/integrations/runtime";
import { publicOrg } from "@/lib/bookings/server";
import { artFor, CERT_FONT_CSS, certDate, layout, readDesign, toSvg } from "@/lib/bookings/certificate";
import { certData, certificateByToken, loadTemplate } from "@/lib/bookings/certificates";
import { BookShell } from "@/components/book/shell";
import { ShareBox } from "@/components/book/share";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string; token: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { token } = await params;
  const c = await certificateByToken(token).catch(() => null);
  return { title: c ? `${c.person_name} — ${c.course_name} certificate` : "Certificate", robots: { index: false, follow: false } };
}

/** Anyone with the link (or the QR code) can check a certificate is genuine and download it. */
export default async function CertificatePage({ params }: P) {
  const { org: slug, token } = await params;
  const org = await publicOrg(slug);
  const db = createServiceClient();
  const c = org ? await certificateByToken(token, db) : null;
  if (!org || !c || c.organisation_id !== org.id) notFound();
  const tpl = await loadTemplate(db, org.id);
  const design = tpl?.design ?? readDesign({ accent: org.brand_colour ?? undefined });
  const data = certData(org, c, design);
  const qr = design.showQr ? await QRCode.toDataURL(data.verifyUrl, { margin: 0, width: 240 }) : null;
  const svg = toSvg(layout(design, data, { logo: !!org.logo_url, art: !!artFor(design) }), { logo: org.logo_url, signature: design.signature, qr, background: design.background, photo: design.photo, art: artFor(design) });
  const valid = c.status === "issued";

  return (
    <BookShell org={org} embed={false} wide>
      <style>{CERT_FONT_CSS}</style>
      <div className="mx-auto max-w-6xl">
      <div className={`mb-5 flex items-center gap-3 rounded-2xl px-5 py-4 ${valid ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
        <BadgeCheck className="h-7 w-7 shrink-0" />
        <p className="text-[0.9375rem]">{valid ? <><b>Genuine certificate.</b> Issued by {org.name} to <b>{c.person_name}</b> for completing {c.course_name} on {certDate(c.completed_on)}.</> : <><b>This certificate has been withdrawn</b> by {org.name}.</>}</p>
      </div>
      {valid && (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a href={`/api/book/certificate/${c.verify_token}`} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)]"><Download className="h-4 w-4" />Download PDF</a>
            <ShareBox url={data.verifyUrl} text={`I completed ${c.course_name} with ${org.name}!`} />
          </div>
          <p className="mt-3 text-[0.8125rem] text-ink-muted">Certificate {c.number}. Add it to your résumé or LinkedIn — this page proves it&apos;s real.</p>
        </>
      )}
      </div>
    </BookShell>
  );
}
