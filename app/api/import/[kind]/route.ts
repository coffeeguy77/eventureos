import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { corsHeaders, importOrg } from "@/lib/imports/server";
import { importLegacyCertificates, legacyWithoutFile, readResponses, saveLegacyFile } from "@/lib/imports/legacy-certs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type P = { params: Promise<{ kind: string }> };
const json = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: corsHeaders(req) });

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsHeaders(req) }); }

export async function GET(req: Request, { params }: P) {
  const { kind } = await params;
  const db = createServiceClient();
  if (kind === "certificate-files") {
    const org = await importOrg(db, req, "certificates");
    if (!org) return json(req, { error: "Not allowed" }, 401);
    return json(req, { pending: await legacyWithoutFile(db, org) });
  }
  return json(req, { error: "Unknown import" }, 404);
}

export async function POST(req: Request, { params }: P) {
  const { kind } = await params;
  const db = createServiceClient();
  const url = new URL(req.url);
  try {
    if (kind === "certificates") {
      const org = await importOrg(db, req, "certificates");
      if (!org) return json(req, { error: "Not allowed" }, 401);
      const stage = (url.searchParams.get("stage") ?? "").replace(/\D/g, "").slice(0, 2);
      if (!stage) return json(req, { error: "Which stage?" }, 400);
      const recs = readResponses(await req.text(), stage);
      return json(req, await importLegacyCertificates(db, org, recs));
    }
    if (kind === "stash") {
      // Raw export from another system (e.g. WooCommerce), kept privately until it's imported. Never public.
      const org = await importOrg(db, req, "shop");
      if (!org) return json(req, { error: "Not allowed" }, 401);
      const name = (url.searchParams.get("name") ?? "").toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(name)) return json(req, { error: "Bad name" }, 400);
      const body = await req.text();
      JSON.parse(body); // must be JSON
      const { error } = await db.storage.from("certificates").upload(`${org}/imports/${name}.json`, body, { contentType: "application/json", upsert: true });
      if (error) throw new Error(error.message);
      return json(req, { ok: true, bytes: body.length });
    }
    if (kind === "certificate-file") {
      const org = await importOrg(db, req, "certificates");
      if (!org) return json(req, { error: "Not allowed" }, 401);
      const path = await saveLegacyFile(db, org, url.searchParams.get("ref") ?? "", new Uint8Array(await req.arrayBuffer()));
      return json(req, { ok: true, path });
    }
    return json(req, { error: "Unknown import" }, 404);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Import failed" }, 500);
  }
}
