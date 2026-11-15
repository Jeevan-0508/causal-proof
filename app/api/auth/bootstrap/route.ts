import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AuthError, enforceRequestSize } from "@/lib/security/auth";
import { hashPassword, openSecurityStore } from "@/lib/security/store";

export const runtime = "nodejs";

function matchesConfiguredToken(candidate: string, configured: string | undefined): boolean { if (!configured) return false; const a = Buffer.from(candidate); const b = Buffer.from(configured); return a.length === b.length && timingSafeEqual(a, b); }

export async function POST(request: Request) {
  const security = openSecurityStore();
  try {
    enforceRequestSize(request, 50_000);
    if (security.userCount() > 0) return NextResponse.json({ error: "Administrator bootstrap is already closed." }, { status: 409 });
    if (!matchesConfiguredToken(request.headers.get("x-bootstrap-token") ?? "", process.env.CAUSAL_PROOF_BOOTSTRAP_TOKEN)) return NextResponse.json({ error: "Explicit bootstrap configuration is required." }, { status: 403 });
    const body = await request.json();
    const passwordHash = await hashPassword(String(body.password ?? ""));
    const user = security.createUser({ username: String(body.username ?? ""), displayName: String(body.displayName ?? "Administrator"), role: "administrator", passwordHash });
    security.appendSecurity("bootstrap.completed", user.id, null, { userId: user.id, role: user.role });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Bootstrap rejected." }, { status: error instanceof AuthError ? error.status : 400 }); }
  finally { security.close(); }
}
