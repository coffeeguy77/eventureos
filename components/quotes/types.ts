import type { QuoteStatus } from "@/lib/types";

/** Shared (client + server) shapes for the quote builder. */

export interface QSection {
  id: string;
  title: string;
  description: string | null;
  position: number;
  is_optional: boolean;
}

export interface QItem {
  id: string;
  section_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
  is_optional: boolean;
  is_package: boolean;
  image_url: string | null;
  position: number;
}

export type ItemPatch = Partial<Pick<QItem,
  "name" | "description" | "quantity" | "unit" | "unit_price" | "tax_rate" | "discount_percent" | "is_optional" | "is_package" | "image_url">>;

export type SectionPatch = Partial<Pick<QSection, "title" | "description" | "is_optional">>;

export interface HeaderPatch {
  title?: string;
  expiry_date?: string | null;
  notes?: string | null;
  terms?: string | null;
}

export interface CatalogueItem {
  name: string;
  description: string | null;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
  is_package: boolean;
  image_url: string | null;
}

export interface SnapshotItem {
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  tax_rate?: number;
  discount_percent?: number;
  optional: boolean;
  package?: boolean;
  image_url?: string | null;
  line_total: number;
}

export interface QuoteSnapshotData {
  title?: string;
  notes?: string | null;
  terms?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  sections: { title: string; description?: string | null; optional?: boolean; items: SnapshotItem[] }[];
  subtotal?: number;
  tax_total?: number;
  total?: number;
}

export interface VersionInfo {
  id: string;
  version_number: number;
  status: QuoteStatus;
  subtotal: number;
  tax_total: number;
  total: number;
  published_at: string;
  published_by: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  accepted_by_name: string | null;
  acceptance_ip: string | null;
  decline_reason: string | null;
}

export interface QuoteDoc {
  id: string;
  name: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };
