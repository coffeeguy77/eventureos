import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const palette = ["bg-brand-100 text-brand-800", "bg-emerald-100 text-emerald-800", "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = 28, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const n = name ?? "?";
  return (
    <span
      title={n}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", palette[hash(n) % palette.length], className)}
    >
      {initials(n)}
    </span>
  );
}
