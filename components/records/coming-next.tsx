import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function ComingNext({ title, subtitle, items, phase = "the next build" }: {
  title: string; subtitle: string; items: string[]; phase?: string;
}) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="max-w-2xl p-6">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand-600">Arriving in {phase}</p>
        <ul className="mt-3 space-y-2">
          {items.map((i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px] text-ink">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />{i}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[12.5px] text-ink-muted">The data model for this area is already in place, so nothing you do today needs re-entering later.</p>
      </Card>
    </div>
  );
}
