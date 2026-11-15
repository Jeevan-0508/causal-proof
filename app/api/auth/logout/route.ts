import { NextResponse } from "next/server";
import { clearSessionCookie, closeAuth, requireAuth, requireCsrf } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let auth = null;
  try { auth = requireAuth(request); requireCsrf(request, auth); auth.security.revokeSession(auth.session.id, auth.user.id); const response = NextResponse.json({ ok: true }); clearSessionCookie(response); response.cookies.set({ name: "causal_proof_csrf", value: "", httpOnly: false, sameSite: "strict", path: "/", maxAge: 0 }); return response; }
  catch (error) { const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Logout failed." }, { status }); }
  finally { closeAuth(auth); }
}
