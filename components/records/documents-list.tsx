import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { relative } from "@/lib/format";

export interface DocRow { id: string; name: string; size_bytes: number | null; visibility: string; requested_from_customer: boolean; created_at: string }

export function DocumentsList({ docs }: { docs: DocRow[] }) {
  if (docs.length === 0) return <p className="px-5 pb-5 text-[12.5px] text-ink-muted">No documents yet. Request documents from customers in the Customer Portal page; customer uploads appear here.</p>;
  return (
    <ul className="divide-y divide-line border-t border-line">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 sm:flex-nowrap sm:py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate text-[13px] text-ink">{d.name}</p>
            <p className="text-[11.5px] text-ink-faint">
              {d.requested_from_customer ? "Requested from customer" : `${d.size_bytes ? Math.round(d.size_bytes / 1024) + " KB · " : ""}added ${relative(d.created_at)}`}
            </p>
          </div>
          {d.requested_from_customer ? <Badge tone="amber">Awaiting upload</Badge> : d.visibility === "customer" ? <Badge tone="green">Shared with customer</Badge> : <Badge>Internal</Badge>}
        </li>
      ))}
    </ul>
  );
}
