import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/status";
import type { ProviderDef } from "@/lib/integrations/registry";

export const STATUS: Record<string, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "green" },
  syncing: { label: "Syncing", tone: "blue" },
  error: { label: "Needs attention", tone: "red" },
  disconnected: { label: "Not connected", tone: "neutral" },
  not_connected: { label: "Not connected", tone: "neutral" },
};
export const SYNC_STATUS: Record<string, { label: string; tone: Tone }> = {
  success: { label: "Last sync OK", tone: "green" },
  partial: { label: "Partly synced", tone: "amber" },
  error: { label: "Last sync failed", tone: "red" },
  running: { label: "Running", tone: "blue" },
};

export function Mark({ p, small }: { p: ProviderDef; small?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-semibold", p.mark.bg, p.mark.fg, small ? "h-8 w-8 text-[13px]" : "h-10 w-10 text-[16px]")} aria-hidden>
      {p.mark.letter}
    </span>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-zinc-100 px-1 py-0.5 text-[11.5px] text-ink">{children}</code>;
}

