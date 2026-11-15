import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { demoInvestigation } from "@/lib/domain/demo";
import { setSessionCookie } from "@/lib/security/auth";
import { hashPassword, openSecurityStore } from "@/lib/security/store";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.CAUSAL_PROOF_DEMO_MODE !== "true") return NextResponse.json({ error: "Explicit demo mode is disabled." }, { status: 404 });
  const security = openSecurityStore(); const repo = openInvestigationRepository();
  try {
    let found = security.getUserByUsername("demo-lead");
    if (!found) {
      try { found = { user: security.createUser({ username: "demo-lead", displayName: "Synthetic Demo Lead", role: "lead_investigator", passwordHash: await hashPassword(randomBytes(24).toString("base64url")) }), passwordHash: "" }; }
      catch { found = security.getUserByUsername("demo-lead"); }
    }
    if (!found) throw new Error("Demo identity could not be initialized.");
    if (!repo.hasInvestigation(demoInvestigation.id)) { try { repo.createInvestigation(demoInvestigation, found.user.id); } catch { if (!repo.hasInvestigation(demoInvestigation.id)) throw new Error("Demo investigation could not be initialized."); } }
    if (!security.membershipRole(demoInvestigation.id, found.user.id)) security.addMembership(demoInvestigation.id, found.user.id, "lead_investigator", found.user.id);
    const created = security.createSession(found.user.id); security.appendSecurity("demo.session.created", found.user.id, demoInvestigation.id, { sessionId: created.session.id });
    const response = NextResponse.json({ user: found.user, session: created.session, csrfToken: created.csrfToken }); setSessionCookie(response, created.token); response.cookies.set({ name: "causal_proof_csrf", value: created.csrfToken, httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 480 * 60 }); return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Demo mode unavailable." }, { status: 400 }); }
  finally { repo.close(); security.close(); }
}
