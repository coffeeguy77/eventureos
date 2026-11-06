import Link from "next/link";

const TABS = [
  { href: "/test-tag", label: "Overview" }, { href: "/test-tag/test", label: "Test now" }, { href: "/test-tag/assets", label: "Assets" },
  { href: "/test-tag/import", label: "Import" }, { href: "/test-tag/settings", label: "Settings" },
];

export function TagNav({ active }: { active: string }) {
  return (
    <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium ${active === t.href ? "bg-brand-600 text-white" : "text-ink-muted ring-1 ring-inset ring-line hover:bg-zinc-50 dark:hover:bg-white/5"}`}>{t.label}</Link>
      ))}
    </nav>
  );
}
