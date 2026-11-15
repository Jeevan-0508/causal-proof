import { NextResponse } from "next/server";
import { changeEvidenceStatus } from "@/lib/domain/kernel";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try { auth = requireAuth(_request); requirePermission(auth, "investigation.read", id); return NextResponse.json({ investigation: repo.loadInvestigation(id), integrity: repo.verifyIntegrity(id), branches: repo.listBranches(id) }); }
  catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 404; return NextResponse.json({ error: status === 404 ? "Investigation not found." : (error instanceof Error ? error.message : "Unable to load investigation.") }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    enforceRequestSize(request); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "investigation.write", id);
    const body = await request.json();
    if (body?.investigation?.id !== id) throw new Error("Investigation ID cannot change during save.");
    const investigation = repo.saveInvestigation(body.investigation, auth.user.id);
    return NextResponse.json({ investigation, integrity: repo.verifyIntegrity(id) });
  } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save investigation." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try { enforceRequestSize(request); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "evidence.mutate", id); const body = await request.json(); const current = repo.loadInvestigation(id); const result = changeEvidenceStatus(current, String(body.evidenceId), body.action, String(body.reason)); const investigation = repo.saveInvestigation(result.investigation, auth.user.id); return NextResponse.json({ investigation, change: result }); }
  catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Evidence mutation rejected." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
