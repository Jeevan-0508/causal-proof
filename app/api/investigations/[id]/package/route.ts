import { NextResponse } from "next/server";
import { exportInvestigationPackage, importInvestigationPackage, verifyInvestigationPackage } from "@/lib/persistence/package";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try { auth = requireAuth(_request); requirePermission(auth, "investigation.export", id); const pack = exportInvestigationPackage(repo, id); auth.security.appendSecurity("export.attempt", auth.user.id, id, { format: "portable-package" }); return NextResponse.json(pack); }
  catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 404; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export package." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function POST(request: Request) {
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    enforceRequestSize(request, 10_000_000); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "investigation.create");
    const body = await request.json();
    const verification = verifyInvestigationPackage(body);
    if (!verification.valid) return NextResponse.json({ verification }, { status: 422 });
    const investigation = importInvestigationPackage(repo, body, auth.user.id);
    auth.security.addMembership(investigation.id, auth.user.id, auth.user.role === "administrator" ? "lead_investigator" : auth.user.role, auth.user.id);
    auth.security.appendSecurity("import.completed", auth.user.id, investigation.id, { packageVersion: body.packageVersion });
    return NextResponse.json({ investigation, verification }, { status: 201 });
  } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import package." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
