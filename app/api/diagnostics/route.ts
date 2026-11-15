import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, requireAuth, requirePermission } from "@/lib/security/auth";
import { assertDemoIsolation } from "@/lib/security/demo-isolation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const repo = openInvestigationRepository();
  let auth = null;
  try {
    auth = requireAuth(request);
    requirePermission(auth, "integrity.verify");
    const investigationId = new URL(request.url).searchParams.get("investigationId");
    const investigation = investigationId ? { id: investigationId, integrity: repo.verifyIntegrity(investigationId) } : null;
    let demo: { enabled: boolean; reason?: string } = { enabled: false };
    try { assertDemoIsolation(); demo = { enabled: true }; } catch (error) { demo = { enabled: false, reason: error instanceof Error ? error.message.split(":")[0] : "not_configured" }; }
    return NextResponse.json({ status: "ok", schemaVersion: repo.schemaVersion(), database: { readable: true, investigationCount: repo.listInvestigations().length }, securityActivity: auth.security.verifySecurityActivity(), trustedKeyCount: auth.security.listKeys().length, anchorConfigured: Boolean(process.env.CAUSAL_PROOF_ANCHOR_DIR), demoIsolation: demo, investigation });
  } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Diagnostics unavailable." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
