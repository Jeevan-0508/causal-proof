import { NextResponse } from "next/server";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { RoleSchema } from "@/lib/security/types";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try { auth = requireAuth(request); requirePermission(auth, "investigation.read", id); return NextResponse.json({ members: auth.security.memberRows(id) }); }
  catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 404; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list members." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try { enforceRequestSize(request, 50_000); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "investigation.manage_members", id); const body = await request.json(); const user = auth.security.getUserByUsername(String(body.username ?? "")); if (!user) throw new Error("Unknown user."); const role = RoleSchema.parse(body.role); if (role === "administrator") throw new Error("Administrator is a global role, not an investigation membership role."); auth.security.addMembership(id, user.user.id, role, auth.user.id); return NextResponse.json({ members: auth.security.memberRows(id) }, { status: 201 }); }
  catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Membership change rejected." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try { enforceRequestSize(request, 50_000); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "investigation.manage_members", id); const body = await request.json(); const user = auth.security.getUserByUsername(String(body.username ?? "")); if (!user) throw new Error("Unknown user."); auth.security.removeMembership(id, user.user.id, auth.user.id); return NextResponse.json({ members: auth.security.memberRows(id) }); }
  catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Membership removal rejected." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
