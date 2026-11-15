import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, requireAuth, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try { auth = requireAuth(_request); requirePermission(auth, "integrity.verify", id); const result = repo.verifyIntegrity(id); auth.security.appendSecurity(result.valid ? "integrity.verified" : "integrity.failure", auth.user.id, id, { checkedEvents: result.checkedEvents, valid: result.valid }); return NextResponse.json(result); }
  catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 404; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify integrity." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
