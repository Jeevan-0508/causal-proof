import { NextResponse } from "next/server";
import { AuthError, clientKey, enforceRequestSize, setSessionCookie } from "@/lib/security/auth";
import { openSecurityStore, verifyPassword } from "@/lib/security/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const security = openSecurityStore();
  try {
    enforceRequestSize(request, 50_000);
    const body = await request.json(); const username = String(body.username ?? "").trim().toLowerCase(); const password = String(body.password ?? ""); const key = `${clientKey(request)}:${username}`; const limit = security.rateLimit(key);
    if (!limit.allowed) return NextResponse.json({ error: "Too many login attempts. Try again later.", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
    const found = security.getUserByUsername(username); const valid = Boolean(found && !found.user.disabled && await verifyPassword(password, found.passwordHash));
    if (!valid) { security.appendSecurity("login.failure", null, null, { username }); return NextResponse.json({ error: "Invalid credentials." }, { status: 401 }); }
    security.resetRateLimit(key); const created = security.createSession(found!.user.id); security.appendSecurity("login.success", found!.user.id, null, { sessionId: created.session.id });
    const response = NextResponse.json({ user: found!.user, session: created.session, csrfToken: created.csrfToken }); setSessionCookie(response, created.token); response.cookies.set({ name: "causal_proof_csrf", value: created.csrfToken, httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 480 * 60 }); return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Login failed." }, { status: error instanceof AuthError ? error.status : 400 }); }
  finally { security.close(); }
}
