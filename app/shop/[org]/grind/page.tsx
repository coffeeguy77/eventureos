import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, shopOrg } from "@/lib/shop/server";
import { ShopFrame, serif, hand } from "@/components/shop/frame";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await shopOrg((await params).org).catch(() => null);
  return org ? { title: { absolute: `Grind guide — ${org.name}` }, description: "Which grind suits your coffee maker, and how to fine-tune it finer or coarser." } : {};
}

/** Little "grounds" drawing: more, smaller dots for finer grinds. */
function Grounds({ i, n }: { i: number; n: number }) {
  const t = n > 1 ? i / (n - 1) : 0;
  const r = 1.1 + t * 4.2;
  const step = r * 2.6 + 1.2;
  const dots: { x: number; y: number }[] = [];
  for (let y = r + 1; y < 60 - r; y += step) for (let x = r + 1 + ((Math.round(y / step) % 2) * step) / 2; x < 60 - r; x += step) dots.push({ x, y });
  return (
    <svg viewBox="0 0 60 60" className="h-full w-full" aria-hidden>
      <defs><clipPath id={`gc${i}`}><circle cx="30" cy="30" r="29" /></clipPath></defs>
      <circle cx="30" cy="30" r="29" fill="#F3EAE0" />
      <g clipPath={`url(#gc${i})`}>{dots.map((d, k) => <circle key={k} cx={d.x + ((k * 37) % 7) / 10} cy={d.y + ((k * 53) % 5) / 10} r={r * (0.82 + ((k * 13) % 5) / 20)} fill={k % 3 ? "#4a2f22" : "#6b4532"} />)}</g>
    </svg>
  );
}

export default async function GrindGuide({ params }: P) {
  const org = await shopOrg((await params).org);
  if (!org) notFound();
  const top = await activeBanners(createServiceClient(), org, ["top"]);
  const chart = org.shop.grindChart;
  const g = org.shop.grinder;
  return (
    <ShopFrame org={org} active="grind" topBanners={top}>
      <section className="bg-[#1d1915] text-[#FFFDFC]">
        <div className={`${PAGE} py-14 sm:py-20`}>
          <Link href={`/shop/${org.slug}`} className="inline-flex items-center gap-1.5 text-[0.9063rem] text-white/70 hover:text-white"><ArrowLeft className="h-4 w-4" />Shop</Link>
          <p className={`${hand} mt-6 text-[1.75rem] leading-none text-[var(--b)]`}>Ground fresh, to order</p>
          <h1 className={`${serif} mt-3 max-w-3xl text-[2.75rem] font-semibold leading-[1.05] sm:text-[3.75rem]`}>Find your perfect grind</h1>
          <p className="mt-5 max-w-2xl text-[1.125rem] leading-relaxed text-white/80">{g ? `We grind every order on our ${g}. ` : ""}Choose the grind for your coffee maker — then fine-tune it a little finer or coarser if your last bag wasn&apos;t quite right.</p>
        </div>
      </section>

      <section className={`${PAGE} py-14 sm:py-16`}>
        <div className="flex items-center justify-between text-[0.875rem] font-semibold uppercase tracking-[0.16em] text-[#8a817a]"><span>← Finer</span><span>Coarser →</span></div>
        <div className="mt-3 h-2 rounded-full bg-[linear-gradient(90deg,#2e1d15,#8a5a3c_50%,#E7D5C0)]" />
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {chart.map((st, i) => (
            <li key={st.label} className="flex flex-col rounded-[22px] bg-[#FFFDFC] p-5 ring-1 ring-[#E6DCD1]">
              <div className="mx-auto h-24 w-24"><Grounds i={i} n={chart.length} /></div>
              <p className="mt-4 text-center text-[1.125rem] font-semibold">{st.label}</p>
              {st.dial && <p className="mt-1 text-center text-[0.875rem] text-[#6b655f]">{g ? `${g} dial` : "Dial"} <span className="font-bold text-[#171714]">{st.dial}</span></p>}
              {st.use && <p className="mt-2 text-center text-[0.875rem] leading-snug text-[#5b5955]">{st.use}</p>}
            </li>
          ))}
        </ol>
        {chart.some((x) => x.dial) && <p className="mt-4 text-[0.875rem] text-[#6b655f]">Dial numbers are our usual starting points{g ? ` on the ${g}` : ""}. Every machine is different — use the fine-tune setting to nudge it.</p>}
      </section>

      <section className="bg-[#F1EAE2] py-14 sm:py-16">
        <div className={`${PAGE} grid gap-6 md:grid-cols-2`}>
          <div className="rounded-[24px] bg-[#FFFDFC] p-7 ring-1 ring-[#E6DCD1]">
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[#8a817a]">Tasted sour, thin or watery?</p>
            <p className={`${serif} mt-2 text-[1.75rem] font-semibold`}>Go a little finer</p>
            <p className="mt-2 leading-relaxed text-[#5b5955]">The water ran through too fast and didn&apos;t pull out the sweetness. For espresso, a shot under about 25 seconds is a sign. Choose &ldquo;a little finer&rdquo; on your next order.</p>
          </div>
          <div className="rounded-[24px] bg-[#FFFDFC] p-7 ring-1 ring-[#E6DCD1]">
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[#8a817a]">Tasted bitter, harsh or dry?</p>
            <p className={`${serif} mt-2 text-[1.75rem] font-semibold`}>Go a little coarser</p>
            <p className="mt-2 leading-relaxed text-[#5b5955]">The water took too long and pulled out bitter flavours — or your plunger was hard to press. Choose &ldquo;a little coarser&rdquo; next time.</p>
          </div>
          <div className="rounded-[24px] bg-[#1d1915] p-7 text-[#FFFDFC] md:col-span-2">
            <p className={`${serif} text-[1.75rem] font-semibold`}>Subscribers: change it any time</p>
            <p className="mt-2 max-w-3xl text-white/80">In your account, pick &ldquo;Change coffee&rdquo; and slide the grind finer or coarser. The next roast will be ground your way.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/shop/${org.slug}`} className="shop-btn inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--b)] px-5 font-semibold text-[var(--on-b)]">Shop coffee<ArrowRight className="h-4 w-4" /></Link>
              <Link href={`/shop/${org.slug}/account`} className="shop-btn inline-flex h-12 items-center rounded-xl px-5 font-semibold ring-1 ring-white/60">My subscription</Link>
            </div>
          </div>
        </div>
      </section>
    </ShopFrame>
  );
}
