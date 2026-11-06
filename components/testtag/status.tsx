import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type TagStatus } from "@/lib/testtag/core";

const TONE: Record<TagStatus, "green" | "amber" | "red" | "slate"> = { ok: "green", due_soon: "amber", overdue: "red", failed: "red", untested: "slate", retired: "slate" };
export const TagBadge = ({ s }: { s: TagStatus }) => <Badge tone={TONE[s]}>{STATUS_LABEL[s]}</Badge>;
