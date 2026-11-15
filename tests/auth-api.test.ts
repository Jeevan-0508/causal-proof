import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST as bootstrap } from "../app/api/auth/bootstrap/route";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { GET as listInvestigations, POST as createInvestigation } from "../app/api/investigations/route";
import { GET as getInvestigation, PUT as putInvestigation, PATCH as patchInvestigation } from "../app/api/investigations/[id]/route";
import { GET as getIntegrity } from "../app/api/investigations/[id]/integrity/route";
import { GET as getPackage, POST as postPackage } from "../app/api/investigations/[id]/package/route";
import { POST as postReplay } from "../app/api/investigations/[id]/replays/route";
import { POST as postBranch } from "../app/api/investigations/[id]/branches/route";
import { GET as getMembers, POST as postMember, DELETE as deleteMember } from "../app/api/investigations/[id]/members/route";
import { GET as getRetention, PUT as putRetention, POST as postRetention } from "../app/api/investigations/[id]/retention/route";
import { POST as postEvidence } from "../app/api/investigations/[id]/evidence/route";
import { GET as getCopilotAnswer, POST as postCopilotAnswer } from "../app/api/investigations/[id]/copilot/answer/route";
import { GET as getCopilotReviews, POST as postCopilotReview } from "../app/api/investigations/[id]/copilot/reviews/route";
import { GET as getActivity } from "../app/api/security/activity/route";
import { GET as getKeys, POST as postKeys } from "../app/api/security/keys/route";
import { GET as getAnchor, POST as postAnchor } from "../app/api/security/anchor/route";
import { GET as getBackup, POST as postBackup } from "../app/api/security/backup/route";
import { PATCH as patchUser } from "../app/api/security/users/[id]/route";
import { demoInvestigation } from "../lib/domain/demo";
import { openSecurityStore } from "../lib/security/store";

const tempDirs: string[] = [];
function setup() { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "causal-proof-auth-")); tempDirs.push(directory); process.env.CAUSAL_PROOF_DB_PATH = path.join(directory, "db.sqlite"); process.env.CAUSAL_PROOF_BOOTSTRAP_TOKEN = "explicit-bootstrap-token"; }
function sessionCookie(response: Response): string { const value = response.headers.get("set-cookie")?.match(/causal_proof_session=([^;]+)/)?.[1]; if (!value) throw new Error("session cookie missing"); return `causal_proof_session=${value}`; }

afterEach(() => { delete process.env.CAUSAL_PROOF_DB_PATH; delete process.env.CAUSAL_PROOF_BOOTSTRAP_TOKEN; for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("authenticated API boundary", () => {
  it("rejects anonymous access on every protected investigation and security endpoint", async () => {
    setup(); const request = () => new Request("http://localhost/api"); const context = { params: Promise.resolve({ id: "INV-2026-041" }) };
    const statuses = [await listInvestigations(request()), await createInvestigation(request()), await getInvestigation(request(), context), await putInvestigation(request(), context), await patchInvestigation(request(), context), await getIntegrity(request(), context), await getPackage(request(), context), await postPackage(request()), await postReplay(request(), context), await postBranch(request(), context), await getMembers(request(), context), await postMember(request(), context), await deleteMember(request(), context), await getRetention(request(), context), await putRetention(request(), context), await postRetention(request(), context), await postEvidence(request(), context), await getCopilotAnswer(request(), context), await postCopilotAnswer(request(), context), await getCopilotReviews(request(), context), await postCopilotReview(request(), context), await getActivity(request()), await getKeys(request()), await postKeys(request()), await getAnchor(request()), await postAnchor(request()), await getBackup(request()), await postBackup(request()), await patchUser(request(), { params: Promise.resolve({ id: "usr-missing" }) })].map((response) => response.status);
    expect(statuses.every((status) => status === 401)).toBe(true);
  });

  it("requires explicit bootstrap, rejects anonymous access, enforces CSRF, and supports revocation", async () => {
    setup();
    const missing = await bootstrap(new Request("http://localhost/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin.user", displayName: "Admin", password: "correct horse battery staple" }) })); expect(missing.status).toBe(403);
    const created = await bootstrap(new Request("http://localhost/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json", "x-bootstrap-token": "explicit-bootstrap-token" }, body: JSON.stringify({ username: "admin.user", displayName: "Admin", password: "correct horse battery staple" }) })); expect(created.status).toBe(201); expect((await bootstrap(new Request("http://localhost/api/auth/bootstrap", { method: "POST", headers: { "x-bootstrap-token": "explicit-bootstrap-token" }, body: "{}" }))).status).toBe(409);
    expect((await listInvestigations(new Request("http://localhost/api/investigations"))).status).toBe(401);
    const loggedIn = await login(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" }, body: JSON.stringify({ username: "admin.user", password: "correct horse battery staple" }) })); expect(loggedIn.status).toBe(200); const payload = await loggedIn.json() as { csrfToken: string }; const cookie = sessionCookie(loggedIn);
    expect((await createInvestigation(new Request("http://localhost/api/investigations", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ investigation: demoInvestigation }) }))).status).toBe(403);
    const saved = await createInvestigation(new Request("http://localhost/api/investigations", { method: "POST", headers: { cookie, "x-csrf-token": payload.csrfToken, "content-type": "application/json" }, body: JSON.stringify({ investigation: demoInvestigation }) })); expect(saved.status).toBe(201);
    const copilot = await postCopilotAnswer(new Request("http://localhost/api/investigations/INV-2026-041/copilot/answer", { method: "POST", headers: { cookie, "x-csrf-token": payload.csrfToken, "content-type": "application/json" }, body: JSON.stringify({ question: "What evidence supports the hypotheses?", mode: "deterministic" }) }), { params: Promise.resolve({ id: "INV-2026-041" }) }); expect(copilot.status).toBe(201); const copilotPayload = await copilot.json() as { answer?: { recommendations: Array<{ actionId: string }> } }; expect(copilotPayload.answer?.recommendations.length).toBeGreaterThan(0);
    const review = await postCopilotReview(new Request("http://localhost/api/investigations/INV-2026-041/copilot/reviews", { method: "POST", headers: { cookie, "x-csrf-token": payload.csrfToken, "content-type": "application/json" }, body: JSON.stringify({ suggestionId: copilotPayload.answer!.recommendations[0].actionId, decision: "rejected", rationale: "Synthetic review rejects this suggestion for testing." }) }), { params: Promise.resolve({ id: "INV-2026-041" }) }); expect(review.status).toBe(201);
    const signedOut = await logout(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { cookie, "x-csrf-token": payload.csrfToken } })); expect(signedOut.status).toBe(200); expect((await listInvestigations(new Request("http://localhost/api/investigations", { headers: { cookie } }))).status).toBe(401);
  });

  it("rate-limits repeated invalid credentials", async () => {
    setup();
    await bootstrap(new Request("http://localhost/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json", "x-bootstrap-token": "explicit-bootstrap-token" }, body: JSON.stringify({ username: "admin.user", displayName: "Admin", password: "correct horse battery staple" }) }));
    let last = 0; for (let index = 0; index < 6; index += 1) last = (await login(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify({ username: "admin.user", password: "invalid invalid invalid" }) }))).status; expect(last).toBe(429);
  });

  it("keeps security activity free of password material", async () => {
    setup(); const security = openSecurityStore({ filename: process.env.CAUSAL_PROOF_DB_PATH }); await (async () => { const response = await bootstrap(new Request("http://localhost/api/auth/bootstrap", { method: "POST", headers: { "x-bootstrap-token": "explicit-bootstrap-token", "content-type": "application/json" }, body: JSON.stringify({ username: "audit.user", displayName: "Audit", password: "correct horse battery staple" }) })); expect(response.status).toBe(201); })(); const activity = security.listSecurityActivity(); expect(JSON.stringify(activity)).not.toContain("correct horse battery staple"); security.close();
  });
});
