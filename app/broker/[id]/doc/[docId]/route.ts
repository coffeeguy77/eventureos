import { NextResponse, type NextRequest } from "next/server";
import { brokerAccess } from "@/lib/loans/broker-auth";
import { logAccess } from "@/lib/loans/log";
import { LOAN_BUCKET, serviceDb } from "@/lib/loans/server";

export const dynamic = "force-dynamic";

/** Open (or with ?dl=1 download) a document — checked, logged, then a 60-second private link. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const acc = await brokerAccess(id);
  if (!acc || !/^[0-9a-f-]{36}$/i.test(docId)) return new NextResponse("Not found", { status: 404 });
  const db = serviceDb();
  const { data: d } = await db.from("loan_documents").select("storage_path, name, organisation_id").eq("id", docId).eq("file_id", id).maybeSingle();
  if (!d) return new NextResponse("Not found", { status: 404 });
  const dl = request.nextUrl.searchParams.get("dl") === "1";
  const { data } = await db.storage.from(LOAN_BUCKET).createSignedUrl(d.storage_path as string, 60, dl ? { download: d.name as string } : undefined);
  if (!data) return new NextResponse("Couldn't open it", { status: 500 });
  await logAccess({
    orgId: d.organisation_id as string, fileId: id, kind: acc.kind === "broker" ? "broker" : "staff",
    name: acc.kind === "broker" ? acc.broker.name : `${acc.name} (preview)`, email: acc.kind === "broker" ? acc.broker.email : null,
    action: dl ? "downloaded_document" : "opened_document", detail: d.name as string,
  });
  return NextResponse.redirect(data.signedUrl);
}
