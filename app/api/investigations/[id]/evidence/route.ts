import { NextResponse } from "next/server";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { EvidenceRecordSchema } from "@/lib/domain/types";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null; try { enforceRequestSize(request); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "evidence.mutate", id); const record = EvidenceRecordSchema.parse(await request.json()); const investigation = repo.loadInvestigation(id); if (investigation.evidence.some((item) => item.id === record.id)) throw new Error(`Evidence already exists: ${record.id}`); const next = repo.saveInvestigation({ ...investigation, evidence: [...investigation.evidence, record] }, auth.user.id); auth.security.appendSecurity("evidence.added", auth.user.id, id, { evidenceId: record.id }); return NextResponse.json({ investigation: next, evidenceId: record.id }, { status: 201 }); } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Evidence addition rejected." }, { status }); } finally { closeAuth(auth); repo.close(); } }
