import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    enforceRequestSize(request); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "replay.run", id);
    const body = await request.json();
    repo.persistReplay(id, body.replay, auth.user.id); auth.security.appendSecurity("replay.recorded", auth.user.id, id, { replayId: body.replay?.replayId ?? "unknown" });
    return NextResponse.json({ ok: true, integrity: repo.verifyIntegrity(id) }, { status: 201 });
  } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to persist replay." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
