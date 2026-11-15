import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    enforceRequestSize(request); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "branch.create", id);
    const body = await request.json();
    const branch = repo.persistBranch(id, body.branch, body.simulation, auth.user.id); auth.security.appendSecurity("branch.created", auth.user.id, id, { branchId: body.branch?.id ?? "unknown" });
    return NextResponse.json({ branch, integrity: repo.verifyIntegrity(id) }, { status: 201 });
  } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to persist branch." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
