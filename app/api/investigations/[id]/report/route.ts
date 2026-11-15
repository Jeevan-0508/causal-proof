import { NextResponse } from "next/server";
import { buildAuthoritativeReport } from "@/lib/report/authoritative";
import { buildInvestigationPdf } from "@/lib/report/pdf";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    auth = requireAuth(request);
    requirePermission(auth, "investigation.export", id);
    const url = new URL(request.url);
    const report = buildAuthoritativeReport(repo, id, { decisionPointId: url.searchParams.get("decisionPointId") ?? undefined });
    auth.security.appendSecurity("report.generated", auth.user.id, id, { format: "json", canonicalPayloadHash: report.canonicalPayloadHash, knowledgeCutoff: report.provenance.knowledgeCutoff });
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 422;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate authoritative report." }, { status });
  } finally { closeAuth(auth); repo.close(); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    enforceRequestSize(request, 20_000);
    auth = requireAuth(request);
    requireCsrf(request, auth);
    requirePermission(auth, "investigation.export", id);
    const body = await request.json().catch(() => ({})) as { format?: string; decisionPointId?: string };
    if (body.format !== "pdf" && body.format !== "json") return NextResponse.json({ error: "REPORT_FORMAT_INVALID: format must be json or pdf." }, { status: 400 });
    const report = buildAuthoritativeReport(repo, id, { decisionPointId: body.decisionPointId });
    auth.security.appendSecurity("report.generated", auth.user.id, id, { format: body.format, canonicalPayloadHash: report.canonicalPayloadHash, knowledgeCutoff: report.provenance.knowledgeCutoff });
    if (body.format === "json") return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
    const bytes = await buildInvestigationPdf(report);
    return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${id.toLowerCase()}-authoritative-report.pdf"`, "cache-control": "no-store", "x-causal-proof-canonical-hash": report.canonicalPayloadHash } });
  } catch (error) {
    const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 422;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate authoritative report." }, { status });
  } finally { closeAuth(auth); repo.close(); }
}
