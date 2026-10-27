import type { Tone } from "@/lib/status";

export const PRINT_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "blue" }, quoted: { label: "Quoted", tone: "amber" }, approved: { label: "Approved", tone: "brand" },
  printing: { label: "Printing", tone: "brand" }, ready: { label: "Ready", tone: "green" }, done: { label: "Done", tone: "slate" }, cancelled: { label: "Cancelled", tone: "neutral" },
};
