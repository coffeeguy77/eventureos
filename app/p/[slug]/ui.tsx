import Link from "next/link";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

/** Org logo, or a monogram in the brand colour when no logo is set. */
export function BrandMark({ name, logoUrl, size = 36 }: { name: string; logoUrl: string | null; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} style={{ height: size, maxWidth: size * 4 }} className="w-auto min-w-0 object-contain" />;
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--portal-brand)] font-semibold text-[color:var(--portal-brand-fg)]"
    >
      {initials(name)}
    </span>
  );
}

/** Button styles that use the organisation's brand colour (set as CSS variables by the portal layout). */
export function portalButton(variant: "primary" | "secondary" = "primary", className?: string) {
  return cn(
    "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-[13.5px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-brand-line)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary"
      ? "bg-[var(--portal-brand)] text-[color:var(--portal-brand-fg)] shadow-sm hover:brightness-95"
      : "bg-white text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50",
    className
  );
}

export function PortalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-[color:var(--portal-brand-ink)] hover:underline", className)}>
      {children}
    </Link>
  );
}

export function Panel({ title, subtitle, action, children, className }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-line bg-white shadow-card", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="break-words text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Detail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-1 break-words text-[14px] text-ink">{children}</dd>
    </div>
  );
}
