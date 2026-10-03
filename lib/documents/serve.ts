import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";

/** Send someone to a short-lived download link for a current library document (checks are done by the caller). */
export async function serveLibraryDoc(orgId: string, docId: string, today: string, opts: { publicOnly?: boolean } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return new NextResponse("Not found", { status: 404 });
  const db = createServiceClient();
  let q = db.from("documents").select("name, storage_path, expires_on, public_share").eq("id", docId).eq("organisation_id", orgId).eq("library", true);
  if (opts.publicOnly) q = q.eq("public_share", true);
  const { data: d } = await q.maybeSingle();
  if (!d?.storage_path || (d.expires_on && d.expires_on < today)) return new NextResponse("This document isn't available any more.", { status: 404 });
  const { data, error } = await db.storage.from("documents").createSignedUrl(d.storage_path, 300, { download: d.name });
  if (error || !data) return new NextResponse("Couldn't open the document — please try again.", { status: 500 });
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
