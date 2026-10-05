import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Check, ChevronRight, Clock, Coffee, LogOut, Plus, Search, Store, Users } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { JOB_KINDS } from "@/lib/jobs/core";
import { currentEmployer, jobsOrg, POST_COLS, unreadFor, type Post } from "@/lib/jobs/server";
import { employerSignOutAction } from "@/app/jobs/actions";
import { EmployerShell, glass } from "@/components/jobs/employer-shell";
import { EmployerAuthDark, EmployerDetailsDark, PostStatusDark } from "@/components/jobs/employer-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employers", robots: { index: false, follow: false } };

const tile = "grid shrink-0 place-items-center rounded-xl border border-white/[0.14] bg-[#1c1316]/85";

export default async function EmployerHome({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ posted?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org || !org.jobs.enabled) notFound();
  const emp = await currentEmployer(org).catch(() => null);
  const db = createServiceClient();

  if (!emp) {
    const features = [
      { icon: Coffee, text: "Free for cafés, coffee carts and event businesses." },
      { icon: Users, text: "Baristas choose whether to share their phone and email — message them through the board first." },
      { icon: Check, text: "When a job is filled, mark it filled and it comes off the board." },
    ];
    return (
      <EmployerShell org={org}>
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 xl:gap-24">
          <div className="lg:pt-8">
            <p className="text-[0.875rem] font-semibold uppercase tracking-[0.04em] text-[var(--b)]">For cafés, carts &amp; events</p>
            <h1 className="mt-3 text-balance text-[3rem] font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-[4rem] xl:text-[4.25rem]">Find trained <span className="text-[var(--b)]">baristas</span> near you</h1>
            <p className="mt-5 max-w-[37rem] text-[1.0625rem] leading-relaxed text-white/80 sm:text-[1.1875rem]">Search baristas trained by {org.name} by suburb and availability, message them, and post one-off shifts, events or regular spots.</p>
            <ul className="mt-8 max-w-[27.5rem]">
              {features.map((f, i) => (
                <li key={f.text} className={`flex items-center gap-7 py-4 ${i < features.length - 1 ? "border-b border-white/15" : ""}`}>
                  <span className={`${tile} h-[82px] w-[82px]`}><f.icon className="h-9 w-9 text-[var(--b)]" strokeWidth={1.6} /></span>
                  <span className="text-[1.125rem] font-semibold leading-snug text-white">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={`${glass} p-6 sm:p-7`}>
            <h2 className="mb-4 text-[1.375rem] font-bold">Employers</h2>
            <EmployerAuthDark slug={slug} approval={org.jobs.employerApproval} />
          </div>
        </div>
      </EmployerShell>
    );
  }

  const [{ data: posts }, unread] = await Promise.all([
    db.from("job_posts").select(POST_COLS).eq("employer_id", emp.id).neq("status", "removed").order("created_at", { ascending: false }).limit(50),
    unreadFor(db, "employer", emp.id),
  ]);
  const list = (posts ?? []) as Post[];
  const approved = emp.status === "approved";
  const bg = org.jobs.employerImage ?? org.jobs.heroImage;
  const actions = [
    { href: `/jobs/${slug}/employers/search`, icon: Search, t: "Find baristas", s: "By suburb, days and skills", pos: "75% 40%" },
    { href: `/jobs/${slug}/employers/post`, icon: Plus, t: "Post a job or shift", s: "One-off, event or regular", pos: "92% 30%" },
  ];

  return (
    <EmployerShell org={org} me={{ name: emp.contact_name }} active="dashboard" unread={approved ? unread : 0} width="max-w-[980px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[2rem] font-bold tracking-[-0.02em] sm:text-[2.375rem]">{emp.business_name}</h1>
          <p className="mt-0.5 text-[0.9375rem] text-white/80">Signed in as {emp.contact_name} • {emp.email}</p>
        </div>
        <form action={employerSignOutAction.bind(null, slug)}><button className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/25 bg-black/30 px-4 text-[0.9375rem] font-semibold text-white hover:bg-white/10"><LogOut className="h-4 w-4" />Sign out</button></form>
      </div>
      {!approved && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-5 text-amber-100"><Clock className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Thanks for signing up — we&apos;re checking your details.</p><p className="text-[0.9375rem] text-amber-100/80">We&apos;ll email you as soon as you can search baristas and post jobs (usually within a day).</p></div></div>}
      {(await searchParams).posted && approved && <p className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-[0.9375rem] text-emerald-100">Your job is live — baristas can see it now.</p>}
      <div className="space-y-6">
        {approved && (
          <div className="grid gap-4 sm:grid-cols-2">
            {actions.map((a) => (
              <Link key={a.href} href={a.href} className="group relative flex min-h-[86px] items-center gap-4 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--b)_75%,transparent)] bg-[#1a1114]/85 p-4 pr-5 transition hover:bg-[#241519]/90">
                {bg && <img src={bg} alt="" className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 object-cover opacity-35 [mask-image:linear-gradient(90deg,transparent,black_60%)]" style={{ objectPosition: a.pos }} />}
                <span className={`${tile} relative h-[52px] w-[52px]`}><a.icon className="h-6 w-6 text-[var(--b)]" strokeWidth={1.8} /></span>
                <span className="relative min-w-0 flex-1"><span className="block text-[1.0625rem] font-semibold">{a.t}</span><span className="block text-[0.875rem] text-white/75">{a.s}</span></span>
                <ChevronRight className="relative h-6 w-6 text-white transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
        {approved && (
          <section>
            <h2 className="mb-2.5 text-[1.25rem] font-semibold">Your jobs</h2>
            {list.length === 0 ? (
              <div className={`${glass} flex items-center gap-4 p-3.5`}><span className={`${tile} h-10 w-10`}><Briefcase className="h-5 w-5 text-[var(--b)]" strokeWidth={1.8} /></span><p className="text-[0.9375rem] text-white/85">No jobs posted yet.</p></div>
            ) : (
              <div className="space-y-3">
                {list.map((p) => (
                  <div key={p.id} className={`${glass} p-4 sm:p-5`}>
                    <div className="flex flex-wrap items-start gap-3">
                      <span className={`${tile} h-10 w-10`}><Briefcase className="h-5 w-5 text-[var(--b)]" strokeWidth={1.8} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-white/60">{JOB_KINDS.find((k) => k.id === p.kind)?.label} · {p.status === "open" ? <span className="text-emerald-400">On the board</span> : p.status === "filled" ? "Filled" : "Closed"}</p>
                        <p className="text-[1.0625rem] font-semibold">{p.title}</p>
                        <p className="text-[0.875rem] text-white/70">{[p.suburb, p.starts_on, p.times, p.pay].filter(Boolean).join(" · ")}</p>
                      </div>
                      <Link href={`/jobs/${slug}/employers/post?id=${p.id}`} className="text-[0.875rem] font-semibold text-[var(--b)] hover:underline">Edit</Link>
                    </div>
                    <div className="mt-3 sm:pl-[52px]"><PostStatusDark slug={slug} postId={p.id} status={p.status} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        <section id="business" className={`${glass} scroll-mt-20 p-5 sm:p-6`}>
          <div className="mb-4 flex items-start gap-4">
            <span className={`${tile} h-11 w-11`}><Store className="h-6 w-6 text-[var(--b)]" strokeWidth={1.7} /></span>
            <div><h2 className="text-[1.25rem] font-semibold">Your business</h2><p className="text-[0.875rem] text-white/70">Baristas see these details on your jobs and when you get in touch, so they know who you are.</p></div>
          </div>
          <EmployerDetailsDark slug={slug} initial={{ business: emp.business_name, name: emp.contact_name, phone: emp.phone ?? "", website: emp.website ?? "", instagram: emp.instagram ?? "",
            address: emp.address ?? "", suburb: emp.suburb ?? "", state: emp.state ?? "", postcode: emp.postcode ?? "", about: emp.about ?? "", equipment: emp.equipment }} />
        </section>
      </div>
    </EmployerShell>
  );
}
