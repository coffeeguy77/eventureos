import { Globe, Instagram, MapPin } from "lucide-react";
import { EQUIPMENT_TYPES, equipmentLabel, readEquipment } from "@/lib/jobs/core";

export interface EmployerInfoData { business_name: string; suburb: string | null; address?: string | null; state?: string | null; postcode?: string | null; website?: string | null; instagram?: string | null; equipment?: unknown; about?: string | null }

/** Who the business is: address, website, Instagram and their coffee gear — shown to baristas. */
export function EmployerInfo({ e, compact = false }: { e: EmployerInfoData; compact?: boolean }) {
  const where = [e.address, e.suburb, [e.state, e.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const gear = readEquipment(e.equipment);
  const maps = where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.business_name}, ${where}`)}` : null;
  const site = e.website && /^https?:\/\//.test(e.website) ? e.website : null;
  return (
    <div className="space-y-1.5 text-[0.8438rem]">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink">
        {where && <a href={maps!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline"><MapPin className="h-3.5 w-3.5 text-ink-faint" />{where}</a>}
        {site && <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline"><Globe className="h-3.5 w-3.5 text-ink-faint" />{site.replace(/^https?:\/\/(www\.)?/, "")}</a>}
        {e.instagram && <a href={`https://www.instagram.com/${e.instagram}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline"><Instagram className="h-3.5 w-3.5 text-ink-faint" />@{e.instagram}</a>}
      </div>
      {gear.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {gear.map((g, i) => <span key={i} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[0.75rem] text-ink" title={EQUIPMENT_TYPES.find((t) => t.id === g.type)?.label}>{equipmentLabel(g)}</span>)}
        </div>
      )}
      {!compact && e.about && <p className="whitespace-pre-line text-ink-muted">{e.about}</p>}
    </div>
  );
}
