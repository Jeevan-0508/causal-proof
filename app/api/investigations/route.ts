import { NextResponse } from "next/server";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const repo = openInvestigationRepository();
  let auth = null;
  try { auth = requireAuth(request); const allowed = new Set(auth.security.authorizedInvestigationIds(auth.user.id)); requirePermission(auth, "investigation.read"); return NextResponse.json({ investigations: repo.listInvestigations().filter((item) => auth!.user.role === "administrator" || allowed.has(item.id)) }); }
  catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list investigations." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function POST(request: Request) {
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    enforceRequestSize(request); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "investigation.create");
    const body = await request.json().catch(() => ({}));
    const investigation = repo.createInvestigation(body?.investigation, auth.user.id);
    auth.security.addMembership(investigation.id, auth.user.id, auth.user.role === "administrator" ? "lead_investigator" : auth.user.role, auth.user.id);
    return NextResponse.json({ investigation }, { status: 201 });
  } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create investigation." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
