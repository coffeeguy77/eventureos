import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, Sparkles, Coffee } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg } from "@/lib/shop/server";
import { ShopFrame, serif, hand } from "@/components/shop/frame";
import { ProductCard, ShopClosed, scheduleChips } from "@/components/shop/bits";
import { BuyBox } from "@/components/shop/buy-box";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { org: o, slug } = await params;
  const org = await shopOrg(o).catch(() => null);
  if (!org) return {};
  const ps = await loadProducts(createServiceClient(), org.id).catch(() => null);
  const p = ps?.find((x) => x.slug === slug);
  if (!p) return {};
  const title = `${p.name} — ${org.name}`;
  return { title: { absolute: title }, description: p.tasting_notes ?? p.short ?? undefined, openGraph: { title, images: p.image_url ? [p.image_url] : undefined } };
}

const paras = (t: string) => t.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);

export default async function ProductPage({ params }: P) {
  const { org: o, slug } = await params;
  const org = await shopOrg(o);
  if (!org) notFound();
  const db = createServiceClient();
  const products = await loadProducts(db, org.id);
  if (!org.shop.enabled || !products) return <ShopFrame org={org}><ShopClosed name={org.name} /></ShopFrame>;
  const p = products.find((x) => x.slug === slug);
  if (!p) notFound();
  const top = await activeBanners(db, org, ["top"]);
  const chips = scheduleChips(org.shop);
  const others = products.filter((x) => x.id !== p.id && x.kind === "coffee").slice(0, 3);
  const facts = [
    p.origin ? { icon: MapPin, label: "Origin", value: p.origin } : null,
    p.roast ? { icon: Sparkles, label: "Roast", value: p.roast } : null,
    p.best_for ? { icon: Coffee, label: "Best for", value: p.best_for } : null,
  ].filter((x): x is { icon: typeof MapPin; label: string; value: string } => !!x);

  return (
    <ShopFrame org={org} active="shop" topBanners={top}>
      <div className={`${PAGE} pt-6`}>
        <Link href={`/shop/${org.slug}`} className="inline-flex items-center gap-1.5 text-[0.9063rem] font-medium text-[#6b655f] hover:text-[#171714]"><ArrowLeft className="h-4 w-4" />All coffee</Link>
      </div>
      <section className={`${PAGE} grid gap-8 pb-16 pt-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14`}>
        <div>
          <div className="relative aspect-square overflow-hidden rounded-[32px] bg-[radial-gradient(ellipse_at_50%_35%,#FFFFFF,color-mix(in_srgb,var(--b)_10%,#F1E9E0))]">
            {p.image_url ? <img src={p.image_url} alt={p.name} className="absolute inset-0 h-full w-full object-contain p-10 sm:p-16" /> : <span className={`${serif} absolute inset-0 grid place-items-center text-[6rem] text-[var(--b)]`}>{p.name[0]}</span>}
          </div>
          {p.images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">{p.images.slice(0, 4).map((src) => <img key={src} src={src} alt="" className="aspect-square w-full rounded-2xl bg-white object-contain p-2" />)}</div>
          )}
        </div>
        <div className="lg:pt-4">
          {p.category && <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-[#8a817a]">{p.category}</p>}
          <h1 className={`${serif} mt-2 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.015em] sm:text-[3.25rem]`}>{p.name}</h1>
          {p.tasting_notes && <p className={`${hand} mt-3 text-[1.75rem] leading-tight text-[var(--b)]`}>{p.tasting_notes}</p>}
          {p.short && <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#3f3c38]">{p.short}</p>}
          {facts.length > 0 && (
            <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {facts.map((f) => <div key={f.label} className="rounded-2xl bg-[#F1EAE2] p-4"><dt className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-[#6b655f]"><f.icon className="h-4 w-4" />{f.label}</dt><dd className="mt-1 text-[0.9688rem] font-semibold leading-snug">{f.value}</dd></div>)}
            </dl>
          )}
          <div className="mt-7"><BuyBox slug={org.slug} p={p} s={org.shop} products={products ?? []} /></div>
          {(chips.length > 0 || org.shop.roastNote) && (
            <div className="mt-5 rounded-2xl border border-dashed border-[#D8CCBF] p-4 text-[0.9375rem] leading-relaxed text-[#4a4743]">
              {org.shop.roastNote || chips.map((c) => c.text).join(" · ")}
            </div>
          )}
        </div>
      </section>
      {p.description && (
        <section className="bg-[#F1EAE2] py-14">
          <div className={`${PAGE} max-w-4xl`}>
            <h2 className={`${serif} text-[2rem] font-semibold`}>About this coffee</h2>
            <div className="mt-4 space-y-4 text-[1.0625rem] leading-relaxed text-[#3f3c38]">{paras(p.description).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div>
          </div>
        </section>
      )}
      {others.length > 0 && (
        <section className={`${PAGE} py-16`}>
          <h2 className={`${serif} text-[2rem] font-semibold`}>You might also like</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{others.map((x) => <ProductCard key={x.id} p={x} slug={org.slug} s={org.shop} currency={org.currency} />)}</div>
        </section>
      )}
    </ShopFrame>
  );
}
