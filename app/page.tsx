"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { demoInvestigation } from "@/lib/domain/demo";
import { parseEventImport } from "@/lib/domain/import";
import { changeEvidenceStatus, compareScenarios, deriveHypothesisAssessments, exportReport, reconstructTimeline, validateCausalGraph } from "@/lib/domain/kernel";
import { analyzeDecisionQuality, createInvestigationBranch, defaultDecisionAlternatives, evaluateDecisionAlternative, getDecisionPoints, replayDecisionPoint } from "@/lib/domain/replay";
import { buildInvestigationPdf } from "@/lib/report/pdf";
import type { DecisionAlternativeResult, DecisionQualityAnalysis, DecisionReplay, EvidenceChange, EvidenceRecord, HypothesisAssessment, Investigation, InvestigationBranch, SimulationComparison } from "@/lib/domain/types";
import type { User } from "@/lib/security/types";
import type { InvestigationSummary } from "@/lib/persistence/sqlite";

const money = (cents: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
const readCookie = (name: string) => document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";

function Icon({ children }: { children: React.ReactNode }) { return <span className="icon" aria-hidden="true">{children}</span>; }

export default function Home() {
  const [activeTab, setActiveTab] = useState<"timeline" | "evidence" | "causal" | "replay" | "lab" | "library" | "security">("timeline");
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | undefined>();
  const [hasInvestigation, setHasInvestigation] = useState(false);
  const [investigation, setInvestigation] = useState<Investigation>(demoInvestigation);
  const decisionPoints = useMemo(() => getDecisionPoints(investigation), [investigation]);
  const [selectedDecisionId, setSelectedDecisionId] = useState(getDecisionPoints(demoInvestigation)[0]?.id ?? "");
  const [replays, setReplays] = useState<DecisionReplay[]>([]);
  const [alternativeResults, setAlternativeResults] = useState<DecisionAlternativeResult[]>([]);
  const [branches, setBranches] = useState<InvestigationBranch[]>([]);
  const [decisionQuality, setDecisionQuality] = useState<DecisionQualityAnalysis[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceRecord | null>(null);
  const [evidenceAction, setEvidenceAction] = useState<EvidenceChange["action"]>("challenge");
  const [challengeDraft, setChallengeDraft] = useState("");
  const [challengeComparison, setChallengeComparison] = useState<EvidenceChange | undefined>();
  const [selectedControl, setSelectedControl] = useState(demoInvestigation.controls[0].id);
  const [sensitivityBps, setSensitivityBps] = useState(demoInvestigation.controls[0].sensitivityBps);
  const [simulation, setSimulation] = useState<SimulationComparison | undefined>();
  const [importError, setImportError] = useState<string | undefined>();
  const [library, setLibrary] = useState<InvestigationSummary[]>([]);
  const [integrity, setIntegrity] = useState<"verified" | "integrity_failure" | "unknown_authenticity">("unknown_authenticity");
  const [persistenceMessage, setPersistenceMessage] = useState("Recovering local state…");
  const hydrated = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const timeline = useMemo(() => reconstructTimeline(investigation.events), [investigation.events]);
  const assessments = useMemo(() => deriveHypothesisAssessments(investigation), [investigation]);
  const validation = useMemo(() => validateCausalGraph(investigation), [investigation]);
  const currentReplay = useMemo(() => selectedDecisionId ? replayDecisionPoint(investigation, selectedDecisionId) : undefined, [investigation, selectedDecisionId]);
  const currentAlternatives = useMemo(() => currentReplay ? defaultDecisionAlternatives(investigation, currentReplay) : [], [investigation, currentReplay]);
  const currentQuality = useMemo(() => currentReplay ? analyzeDecisionQuality(investigation, currentReplay) : undefined, [investigation, currentReplay]);
  const totalLoss = investigation.events.filter((event) => event.kind === "transaction").reduce((sum, event) => sum + (event.amountCents ?? 0), 0);
  const activeEvidenceCount = investigation.evidence.filter((item) => item.status === "active").length;
  const challengedCount = investigation.evidence.filter((item) => item.status !== "active").length;

  const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers); const method = (init.method ?? "GET").toUpperCase(); if (method !== "GET" && method !== "HEAD") headers.set("x-csrf-token", readCookie("causal_proof_csrf")); return fetch(input, { ...init, headers, credentials: "same-origin" });
  };

  async function loadInvestigationState() {
    const listResponse = await apiFetch("/api/investigations", { cache: "no-store" }); const listed = await listResponse.json() as { investigations?: InvestigationSummary[]; error?: string }; if (!listResponse.ok) throw new Error(listed.error ?? "Unable to load investigations."); let id = listed.investigations?.[0]?.id;
    if (!id) { setHasInvestigation(false); setPersistenceMessage("No investigation is assigned to this identity"); hydrated.current = true; return; }
    const loaded = await apiFetch(`/api/investigations/${encodeURIComponent(id)}`, { cache: "no-store" }); const payload = await loaded.json() as { investigation: Investigation; integrity: { status: typeof integrity }; branches?: InvestigationBranch[]; error?: string }; if (!loaded.ok) throw new Error(payload.error ?? "Unable to recover investigation."); setHasInvestigation(true); setInvestigation(payload.investigation); setBranches(payload.branches ?? []); setIntegrity(payload.integrity.status); const refreshed = await apiFetch("/api/investigations", { cache: "no-store" }); setLibrary((await refreshed.json() as { investigations: InvestigationSummary[] }).investigations); setPersistenceMessage("Recovered from SQLite"); hydrated.current = true;
  }

  useEffect(() => {
    void (async () => {
      try {
        let me = await apiFetch("/api/auth/me", { cache: "no-store" });
        if (!me.ok) me = await apiFetch("/api/auth/demo", { method: "POST" });
        if (!me.ok) { setAuthState("signed_out"); return; }
        const identity = await me.json() as { user: User }; setUser(identity.user); setAuthState("signed_in"); await loadInvestigationState();
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Unable to establish a session."); setAuthState("signed_out");
      }
    })();
  }, []);

  async function login(username: string, password: string) { setAuthError(undefined); const response = await apiFetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) }); const payload = await response.json() as { user?: User; error?: string }; if (!response.ok || !payload.user) throw new Error(payload.error ?? "Login failed."); setUser(payload.user); setAuthState("signed_in"); await loadInvestigationState(); }
  async function logout() { await apiFetch("/api/auth/logout", { method: "POST" }); hydrated.current = false; setUser(null); setAuthState("signed_out"); }

  if (authState === "loading") return <div className="auth-shell"><div className="auth-card"><span className="brand-mark">C</span><p className="eyebrow">CAUSAL//PROOF</p><h1>Establishing trusted session</h1><p>Checking the local identity boundary…</p></div></div>;
  if (authState === "signed_out") return <AuthPanel error={authError} onLogin={login} />;
  if (!hasInvestigation) return <NoInvestigation user={user} onLogout={logout} />;

  async function persistInvestigation(next: Investigation) {
    if (!hydrated.current) return;
    try {
      const response = await apiFetch(`/api/investigations/${encodeURIComponent(next.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ investigation: next }) });
      const payload = await response.json() as { integrity?: { status: typeof integrity }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Save rejected");
      if (payload.integrity) setIntegrity(payload.integrity.status);
      setPersistenceMessage("Saved transactionally to SQLite");
      const refreshed = await apiFetch("/api/investigations", { cache: "no-store" });
      setLibrary((await refreshed.json() as { investigations: InvestigationSummary[] }).investigations);
    } catch (error) { setPersistenceMessage(error instanceof Error ? `Save failed: ${error.message}` : "Save failed"); }
  }

  function openEvidence(record: EvidenceRecord) {
    setSelectedEvidence(record);
    setEvidenceAction(record.status === "active" ? "challenge" : "restore");
    setChallengeDraft("");
  }

  async function submitEvidenceAction() {
    if (!selectedEvidence || !challengeDraft.trim()) return;
    const result = changeEvidenceStatus(investigation, selectedEvidence.id, evidenceAction, challengeDraft);
    try { const response = await apiFetch(`/api/investigations/${encodeURIComponent(investigation.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceId: selectedEvidence.id, action: evidenceAction, reason: challengeDraft }) }); const payload = await response.json() as { investigation?: Investigation; change?: EvidenceChange; error?: string }; if (!response.ok || !payload.investigation) throw new Error(payload.error ?? "Evidence mutation rejected."); setInvestigation(payload.investigation); setChallengeComparison(payload.change ?? { ...result, investigation: payload.investigation }); setSelectedEvidence(null); setChallengeDraft(""); } catch (error) { setImportError(error instanceof Error ? error.message : "Evidence mutation rejected."); }
  }

  function downloadReport() {
    const report = exportReport(investigation, simulation?.intervention, "2026-04-08T12:00:00+00:00", { replays, alternativeResults, branches, decisionQuality });
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${investigation.id.toLowerCase()}-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    const report = exportReport(investigation, simulation?.intervention, "2026-04-08T12:00:00+00:00", { replays, alternativeResults, branches, decisionQuality });
    const bytes = await buildInvestigationPdf(report);
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${investigation.id.toLowerCase()}-report.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPackage() {
    const response = await apiFetch(`/api/investigations/${encodeURIComponent(investigation.id)}/package`);
    const pack = await response.json();
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${investigation.id.toLowerCase()}.causalproof.json`; link.click(); URL.revokeObjectURL(url);
  }

  async function verifyStoredIntegrity() {
    const response = await apiFetch(`/api/investigations/${encodeURIComponent(investigation.id)}/integrity`, { cache: "no-store" });
    const result = await response.json() as { status: typeof integrity; issues?: string[] };
    setIntegrity(result.status);
    setPersistenceMessage(result.status === "verified" ? "Local chain consistent; authenticity remains unknown" : `Integrity failure: ${result.issues?.join(" ") ?? "unknown"}`);
  }

  function selectDecision(decisionId: string) {
    setSelectedDecisionId(decisionId);
    const replay = replayDecisionPoint(investigation, decisionId);
    setReplays((current) => [...current.filter((item) => item.replayId !== replay.replayId), replay]);
    setDecisionQuality((current) => [...current.filter((item) => item.decisionPointId !== replay.decisionPoint.id), analyzeDecisionQuality(investigation, replay)]);
    if (hydrated.current) void apiFetch(`/api/investigations/${encodeURIComponent(investigation.id)}/replays`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replay }) });
  }

  function simulateAlternative(alternative: Parameters<typeof evaluateDecisionAlternative>[2]) {
    if (!currentReplay) return;
    const result = evaluateDecisionAlternative(investigation, currentReplay, alternative, 20261114);
    const branch = createInvestigationBranch(investigation, currentReplay, result);
    setAlternativeResults((current) => [...current.filter((item) => item.alternative.id !== alternative.id), result]);
    setBranches((current) => [...current.filter((item) => item.id !== branch.id), branch]);
    if (hydrated.current) void (async () => {
      await apiFetch(`/api/investigations/${encodeURIComponent(investigation.id)}/replays`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replay: currentReplay }) });
      const response = await apiFetch(`/api/investigations/${encodeURIComponent(investigation.id)}/branches`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branch, simulation: result.simulation }) });
      if (response.ok) setPersistenceMessage("Replay and immutable branch saved");
    })();
  }

  async function importEvents(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const format = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
      const events = parseEventImport(text, format);
      const imported = { ...investigation, id: `${investigation.id}-IMPORTED`, events };
      const response = await apiFetch("/api/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ investigation: imported }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Imported investigation was not saved.");
      setInvestigation(imported);
      setPersistenceMessage("Imported investigation saved to SQLite");
      setImportError(undefined);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      event.target.value = "";
    }
  }

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><span className="brand-mark">C</span><span>CAUSAL<span className="slash">//</span>PROOF</span></div>
      <div className="rail-rule" />
      <nav aria-label="Investigation modules">
        <button className={activeTab === "timeline" ? "rail-item active" : "rail-item"} onClick={() => setActiveTab("timeline")}><Icon>◷</Icon><span>Reconstruction</span></button>
        <button className={activeTab === "evidence" ? "rail-item active" : "rail-item"} onClick={() => setActiveTab("evidence")}><Icon>◈</Icon><span>Evidence intelligence</span><small>{activeEvidenceCount}</small></button>
        <button className={activeTab === "causal" ? "rail-item active" : "rail-item"} onClick={() => setActiveTab("causal")}><Icon>⌘</Icon><span>Causal hypotheses</span></button>
        <button className={activeTab === "replay" ? "rail-item active" : "rail-item"} onClick={() => setActiveTab("replay")}><Icon>↻</Icon><span>Decision replay</span><small>{decisionPoints.length}</small></button>
        <button className={activeTab === "lab" ? "rail-item active" : "rail-item"} onClick={() => setActiveTab("lab")}><Icon>△</Icon><span>Counterfactual lab</span></button>
        <button className={activeTab === "library" ? "rail-item active" : "rail-item"} onClick={() => setActiveTab("library")}><Icon>▤</Icon><span>Investigation library</span><small>{library.length}</small></button>
        <button className={activeTab === "security" ? "rail-item active" : "rail-item"} onClick={() => setActiveTab("security")}><Icon>⌾</Icon><span>Security workspace</span></button>
      </nav>
      <div className="rail-bottom"><div className="system"><span className="status-dot" />Local kernel online</div><div className="version">CAUSAL//PROOF <span>v0.2</span></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div className="crumb"><span>INVESTIGATIONS</span><b>/</b> {investigation.id}</div><div className="top-actions"><span className="identity-chip">{user?.displayName} · {user?.role.replaceAll("_", " ")}</span><span className="local-badge"><span className="status-dot" />LOCAL ONLY</span><span className={`integrity-chip ${integrity}`} title="Integrity consistency is not evidence truth"><span className="status-dot" />{integrity === "verified" ? "CHAIN CONSISTENT" : integrity === "integrity_failure" ? "INTEGRITY FAILURE" : "AUTHENTICITY UNKNOWN"}</span><input ref={fileInput} type="file" accept=".json,.csv,application/json,text/csv" onChange={importEvents} hidden /><button className="ghost-btn" onClick={() => fileInput.current?.click()}><Icon>↑</Icon> Import events</button><button className="ghost-btn" onClick={downloadPackage}><Icon>⇩</Icon> Package</button><button className="ghost-btn" onClick={downloadReport}><Icon>↓</Icon> JSON</button><button className="ghost-btn" onClick={downloadPdf}><Icon>↓</Icon> PDF</button><button className="ghost-btn" onClick={verifyStoredIntegrity}>Verify chain</button><button className="ghost-btn" onClick={logout}>Sign out</button><div className="avatar">{user?.displayName.slice(0, 1).toUpperCase() ?? "R"}</div></div></header>
      <div className="content">
        {importError && <div className="warning-banner"><strong>Import rejected.</strong> {importError}<button onClick={() => setImportError(undefined)} aria-label="Dismiss import error">×</button></div>}
        <div className="title-row"><div><p className="eyebrow">OPEN INVESTIGATION <span className="pill">{investigation.status}</span></p><h1>{investigation.title}</h1><p className="subtitle">Synthetic logistics-fraud scenario <span className="mono">·</span> opened 08 Apr 2026</p></div><div className="headline-stat"><span>SIMULATED EXPOSURE</span><strong>{money(totalLoss)}</strong><small>observed transaction total in scenario</small></div></div>
        <div className="metric-grid"><div className="metric"><span>EVENTS</span><strong>{String(investigation.events.length).padStart(2, "0")}</strong><small>chronological records</small></div><div className="metric"><span>ACTORS / ACCOUNTS</span><strong>04 / 03</strong><small>distinct entities</small></div><div className="metric"><span>EVIDENCE</span><strong>{String(investigation.evidence.length).padStart(2, "0")}</strong><small>{challengedCount} challenged or withdrawn</small></div><div className="metric"><span>CAUSAL EDGES</span><strong>{String(investigation.causalEdges.length).padStart(2, "0")}</strong><small>{validation.valid ? "DAG checks passed" : "graph requires repair"}</small></div></div>
        <div className="module-head"><div><p className="eyebrow">MODULE 0{["timeline", "evidence", "causal", "replay", "lab", "library", "security"].indexOf(activeTab) + 1}</p><h2>{activeTab === "timeline" ? "Incident reconstruction" : activeTab === "evidence" ? "Evidence intelligence" : activeTab === "causal" ? "Causal hypothesis map" : activeTab === "replay" ? "Decision replay" : activeTab === "lab" ? "Counterfactual laboratory" : activeTab === "library" ? "Investigation library" : "Security workspace"}</h2></div><p className="module-note">{activeTab === "timeline" ? "Event time is primary. Ingestion lag is retained, never overwritten." : activeTab === "evidence" ? "Challenges are append-only. Conclusions recalculate from active evidence." : activeTab === "causal" ? "Edges require assumptions. Correlation is marked separately from identification." : activeTab === "replay" ? "Historical knowledge boundaries prevent hindsight leakage." : activeTab === "lab" ? "Seeded execution makes each scenario reproducible." : activeTab === "library" ? persistenceMessage : "Access policy, external anchoring, encrypted recovery, and retention controls."}</p></div>

        {activeTab === "timeline" && <Timeline timeline={timeline} />}
        {activeTab === "evidence" && <EvidenceList evidence={investigation.evidence} comparison={challengeComparison} onSelect={openEvidence} />}
        {activeTab === "causal" && <CausalMap investigation={investigation} assessments={assessments} validation={validation} />}
        {activeTab === "replay" && <ReplayPanel investigation={investigation} decisionPoints={decisionPoints} selectedDecisionId={selectedDecisionId} onSelectDecision={selectDecision} replay={currentReplay} alternatives={currentAlternatives} results={alternativeResults} branches={branches} quality={currentQuality} onSimulate={simulateAlternative} />}
        {activeTab === "lab" && <Lab investigation={investigation} selectedControl={selectedControl} setSelectedControl={(controlId) => { setSelectedControl(controlId); const control = investigation.controls.find((item) => item.id === controlId); if (control) setSensitivityBps(control.sensitivityBps); }} sensitivityBps={sensitivityBps} setSensitivityBps={setSensitivityBps} simulation={simulation} onRun={() => setSimulation(compareScenarios(investigation, selectedControl, 20261114, sensitivityBps))} />}
        {activeTab === "library" && <InvestigationLibrary investigations={library} currentId={investigation.id} onSelect={async (id) => { const response = await apiFetch(`/api/investigations/${encodeURIComponent(id)}`); const payload = await response.json() as { investigation: Investigation; integrity: { status: typeof integrity }; branches?: InvestigationBranch[] }; if (payload.investigation) { setInvestigation(payload.investigation); setBranches(payload.branches ?? []); setIntegrity(payload.integrity.status); setActiveTab("timeline"); } }} />}
        {activeTab === "security" && <SecurityPanel user={user} investigationId={investigation.id} integrity={integrity} onMessage={setPersistenceMessage} />}

        <footer className="integrity-footer"><span><span className="status-dot" />{persistenceMessage}</span><span>Chain consistency is not authenticity or evidence truth</span></footer>
      </div>
    </section>

    {selectedEvidence && <EvidenceDrawer evidence={selectedEvidence} action={evidenceAction} setAction={setEvidenceAction} draft={challengeDraft} setDraft={setChallengeDraft} onClose={() => setSelectedEvidence(null)} onSubmit={submitEvidenceAction} />}
  </main>;
}

function AuthPanel({ error, onLogin }: { error?: string; onLogin: (username: string, password: string) => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "bootstrap">("login"); const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState(""); const [password, setPassword] = useState(""); const [bootstrapToken, setBootstrapToken] = useState(""); const [message, setMessage] = useState(error);
  async function submit(event: React.FormEvent) { event.preventDefault(); setMessage(undefined); if (mode === "login") { try { await onLogin(username, password); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Login failed."); } return; } const response = await fetch("/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json", "x-bootstrap-token": bootstrapToken }, body: JSON.stringify({ username, displayName, password }) }); const payload = await response.json() as { error?: string }; setMessage(response.ok ? "Administrator created. Sign in with the new credentials." : payload.error ?? "Bootstrap failed."); if (response.ok) setMode("login"); }
  return <div className="auth-shell"><form className="auth-card" onSubmit={submit}><div className="brand"><span className="brand-mark">C</span><span>CAUSAL<span className="slash">//</span>PROOF</span></div><p className="eyebrow">TRUSTED INVESTIGATION WORKSPACE</p><h1>{mode === "login" ? "Sign in to investigate" : "Bootstrap administrator"}</h1><p>{mode === "login" ? "Protected investigations require an attributable identity." : "Set CAUSAL_PROOF_BOOTSTRAP_TOKEN first. No default administrator exists."}</p>{message && <div className="warning-banner">{message}</div>}<label className="field-label" htmlFor="auth-username">Username</label><input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />{mode === "bootstrap" && <><label className="field-label" htmlFor="auth-display">Display name</label><input id="auth-display" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></>}<label className="field-label" htmlFor="auth-password">Password</label><input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} required />{mode === "bootstrap" && <><label className="field-label" htmlFor="bootstrap-token">Local bootstrap token</label><input id="bootstrap-token" type="password" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} required /></>}<button className="primary-btn" type="submit">{mode === "login" ? "Sign in" : "Create administrator"}</button><button className="ghost-btn auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "bootstrap" : "login"); setMessage(undefined); }}>{mode === "login" ? "First run? Bootstrap administrator" : "Return to sign in"}</button><small>Sessions expire and can be revoked. Cryptographic integrity is not evidence truth.</small></form></div>;
}

function NoInvestigation({ user, onLogout }: { user: User | null; onLogout: () => Promise<void> }) {
  const [message, setMessage] = useState("No investigation is assigned to this identity.");
  async function createDemo() { const response = await fetch("/api/investigations", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": readCookie("causal_proof_csrf") }, body: JSON.stringify({ investigation: demoInvestigation }) }); const payload = await response.json() as { error?: string }; setMessage(response.ok ? "Investigation created. Reloading…" : payload.error ?? "Creation rejected."); if (response.ok) window.location.reload(); }
  return <div className="auth-shell"><div className="auth-card"><p className="eyebrow">SIGNED IN · {user?.role.replaceAll("_", " ")}</p><h1>No investigation assigned</h1><p>{message}</p>{user?.role === "administrator" || user?.role === "lead_investigator" ? <button className="primary-btn" onClick={createDemo}>Create synthetic investigation</button> : null}<button className="ghost-btn auth-switch" onClick={onLogout}>Sign out</button></div></div>;
}

function SecurityPanel({ user, investigationId, integrity, onMessage }: { user: User | null; investigationId: string; integrity: string; onMessage: (message: string) => void }) {
  const [anchorStatus, setAnchorStatus] = useState("not checked"); const [passphrase, setPassphrase] = useState(""); const [retentionDays, setRetentionDays] = useState(365); const [legalHold, setLegalHold] = useState(false); const [activity, setActivity] = useState<Array<{ action: string; recordedAt: string }>>([]);
  const request = (input: RequestInfo | URL, init: RequestInit = {}) => { const headers = new Headers(init.headers); if ((init.method ?? "GET").toUpperCase() !== "GET") headers.set("x-csrf-token", readCookie("causal_proof_csrf")); return fetch(input, { ...init, headers, credentials: "same-origin" }); };
  async function verifyAnchor() { const response = await request(`/api/security/anchor?investigationId=${encodeURIComponent(investigationId)}`); const payload = await response.json() as { status?: string; issues?: string[]; error?: string }; setAnchorStatus(payload.status ?? payload.error ?? "unknown"); onMessage(payload.issues?.join(" ") ?? "Anchor verification completed."); }
  async function rotateKey() { const response = await request("/api/security/keys", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); const payload = await response.json() as { key?: { keyId: string }; error?: string }; onMessage(response.ok ? `Trusted key rotated: ${payload.key?.keyId}` : payload.error ?? "Key rotation failed."); }
  async function publishAnchor() { const response = await request("/api/security/anchor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ investigationId }) }); const payload = await response.json() as { verification?: { status: string }; error?: string }; setAnchorStatus(payload.verification?.status ?? "unknown"); onMessage(response.ok ? "Checkpoint published to the configured independent anchor directory." : payload.error ?? "Anchor publication failed."); }
  async function downloadBackup() { const response = await request("/api/security/backup", { headers: { "x-backup-passphrase": passphrase } }); const payload = await response.json() as { backup?: unknown; error?: string }; if (!response.ok || !payload.backup) { onMessage(payload.error ?? "Backup failed."); return; } const blob = new Blob([JSON.stringify(payload.backup, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${investigationId.toLowerCase()}.encrypted-backup.json`; link.click(); URL.revokeObjectURL(url); onMessage("Encrypted backup downloaded; the passphrase is not stored."); }
  async function saveRetention() { const response = await request(`/api/investigations/${encodeURIComponent(investigationId)}/retention`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ retentionDays, legalHold, backupRetentionDays: 30, exportRetentionDays: 30 }) }); const payload = await response.json() as { error?: string }; onMessage(response.ok ? "Retention policy saved." : payload.error ?? "Retention policy rejected."); }
  async function loadActivity() { const response = await request("/api/security/activity"); const payload = await response.json() as { activity?: Array<{ action: string; recordedAt: string }>; error?: string }; if (response.ok) setActivity(payload.activity ?? []); else onMessage(payload.error ?? "Activity access denied."); }
  return <section className="security-panel"><div className="security-grid"><article className="security-card"><span className="eyebrow">IDENTITY</span><h3>{user?.displayName}</h3><p className="mono">{user?.username} · {user?.role.replaceAll("_", " ")}</p><p>Protected API access is attributable to this session. Session expiration and revocation are enforced server-side.</p></article><article className="security-card"><span className="eyebrow">LOCAL CHAIN</span><h3>{integrity.replaceAll("_", " ")}</h3><p>Chain consistency is not authenticity or evidence truth.</p><button className="ghost-btn" onClick={verifyAnchor}>Verify external anchor</button><strong className="security-state">{anchorStatus}</strong></article></div><div className="security-grid"><article className="security-card"><span className="eyebrow">KEY CUSTODY</span><h3>Trusted Ed25519 registry</h3><p>Private keys remain in the explicitly configured local key directory; only public metadata enters SQLite.</p><button className="ghost-btn" disabled={user?.role !== "administrator"} onClick={rotateKey}>Rotate signing key</button><button className="ghost-btn" onClick={publishAnchor}>Publish checkpoint</button></article><article className="security-card"><span className="eyebrow">ENCRYPTED RECOVERY</span><h3>AES-256-GCM backup</h3><input type="password" placeholder="Backup passphrase · 16+ chars" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /><button className="ghost-btn" disabled={passphrase.length < 16} onClick={downloadBackup}>Create encrypted backup</button><p>Restore requires a clean target and post-restore integrity verification.</p></article></div><article className="security-card retention-card"><span className="eyebrow">RETENTION POLICY</span><h3>Logical retention with preservation hold</h3><div className="retention-controls"><label>Days <input type="number" min={1} value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} /></label><label><input type="checkbox" checked={legalHold} onChange={(event) => setLegalHold(event.target.checked)} /> Legal hold</label><button className="ghost-btn" onClick={saveRetention}>Save policy</button></div><p>No policy means no action. Applying policy records logical retention only; forensic history is never silently erased.</p></article>{user?.role === "administrator" && <article className="security-card"><span className="eyebrow">SECURITY ACTIVITY</span><button className="ghost-btn" onClick={loadActivity}>Load protected activity</button>{activity.slice(0, 10).map((entry, index) => <p className="history-line" key={`${entry.action}-${index}`}><span className="mono">{entry.action}</span> · {entry.recordedAt}</p>)}</article>}</section>;
}

function InvestigationLibrary({ investigations, currentId, onSelect }: { investigations: InvestigationSummary[]; currentId: string; onSelect: (id: string) => void }) {
  return <section className="library-panel"><div className="library-intro"><div><span className="eyebrow">LOCAL SQLITE LIBRARY</span><h3>Saved investigations</h3><p>Each record is isolated by investigation ID. Integrity status describes the local ledger only.</p></div><span className="mono">{investigations.length} saved</span></div><div className="library-list">{investigations.map((item) => <button className={`library-row ${item.id === currentId ? "selected" : ""}`} key={item.id} onClick={() => onSelect(item.id)}><div><span className="event-type neutral">{item.status}</span><h3>{item.title}</h3><p className="mono">{item.id} · updated {item.updatedAt}</p></div><div className="library-meta"><strong>{item.integrity === "verified" ? "CHAIN CONSISTENT" : item.integrity === "integrity_failure" ? "INTEGRITY FAILURE" : "AUTHENTICITY UNKNOWN"}</strong><span>{item.evidenceCount} evidence · {item.branchCount} branches</span></div></button>)}</div></section>;
}

function EvidenceDrawer({ evidence, action, setAction, draft, setDraft, onClose, onSubmit }: { evidence: EvidenceRecord; action: EvidenceChange["action"]; setAction: (action: EvidenceChange["action"]) => void; draft: string; setDraft: (draft: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="drawer" role="dialog" aria-modal="true" aria-labelledby="challenge-title" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="eyebrow">EVIDENCE RECORD</p><h2 id="challenge-title">{evidence.title}</h2></div><button className="close-btn" onClick={onClose} aria-label="Close evidence details">×</button></div><div className="detail-grid"><span>TYPE</span><strong>{evidence.type.replaceAll("_", " ")}</strong><span>SOURCE</span><strong>{evidence.source}</strong><span>STATUS</span><strong className={evidence.status === "active" ? "green" : "amber"}>{evidence.status}</strong><span>HASH</span><strong className="hash">{evidence.integrityHash}</strong></div><div className="rationale"><span>ORIGINAL RATIONALE</span><p>{evidence.rationale}</p><span>IMMUTABLE HISTORY</span>{evidence.history.map((entry) => <p className="history-line" key={entry.id}><span className="mono">{entry.kind}</span> · {entry.reason}</p>)}</div><div className="action-switcher"><button className={action === "challenge" ? "selected" : ""} onClick={() => setAction("challenge")} disabled={evidence.status === "withdrawn"}>Challenge</button><button className={action === "withdraw" ? "selected" : ""} onClick={() => setAction("withdraw")} disabled={evidence.status === "withdrawn"}>Withdraw</button><button className={action === "restore" ? "selected" : ""} onClick={() => setAction("restore")} disabled={evidence.status === "active"}>Restore</button></div><label className="field-label" htmlFor="challenge">{action === "restore" ? "Reason for restoring this record" : action === "withdraw" ? "Reason this record should be withdrawn" : "Challenge authenticity or interpretation"}</label><textarea id="challenge" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="State what is uncertain, missing, or contradicted…" /><div className="drawer-actions"><button className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary-btn" onClick={onSubmit} disabled={!draft.trim()}>Record {action}</button></div></section></div>;
}

function ReplayPanel({ investigation, decisionPoints, selectedDecisionId, onSelectDecision, replay, alternatives, results, branches, quality, onSimulate }: { investigation: Investigation; decisionPoints: ReturnType<typeof getDecisionPoints>; selectedDecisionId: string; onSelectDecision: (id: string) => void; replay?: DecisionReplay; alternatives: ReturnType<typeof defaultDecisionAlternatives>; results: DecisionAlternativeResult[]; branches: InvestigationBranch[]; quality?: DecisionQualityAnalysis; onSimulate: (alternative: (typeof alternatives)[number]) => void }) {
  const selectedIndex = Math.max(0, decisionPoints.findIndex((point) => point.id === selectedDecisionId));
  return <section className="replay-panel"><div className="replay-controls"><div className="panel-label">DECISION POINT SCRUBBER</div><div className="replay-select-row"><input aria-label="Decision point timeline" type="range" min="0" max={Math.max(0, decisionPoints.length - 1)} value={selectedIndex} onChange={(event) => onSelectDecision(decisionPoints[Number(event.target.value)]?.id ?? selectedDecisionId)} /><select aria-label="Decision point" value={selectedDecisionId} onChange={(event) => onSelectDecision(event.target.value)}>{decisionPoints.map((point) => <option key={point.id} value={point.id}>{point.decidedAt.slice(11, 16)} · {point.summary}</option>)}</select></div><div className="decision-markers">{decisionPoints.map((point, index) => <button className={point.id === selectedDecisionId ? "selected" : ""} key={point.id} onClick={() => onSelectDecision(point.id)}>{index + 1}<small>{point.decidedAt.slice(11, 16)}</small></button>)}</div></div>{replay && <><div className="replay-header"><div><span className="eyebrow">HISTORICAL KNOWLEDGE BOUNDARY</span><h3>{replay.decisionPoint.summary}</h3><p>{replay.decisionPoint.decidedAt} · actor <span className="mono">{replay.decisionPoint.actorId}</span></p></div><span className="replay-hash">{replay.replayHash.slice(0, 20)}…</span></div><div className="replay-grid"><div className="boundary-card"><span>KNOWN AT CUTOFF</span><strong>{replay.knownEventIds.length} events · {replay.knownEvidenceIds.length} evidence</strong><small>{replay.generatedAlertIds.length} alerts · {replay.priorDecisionIds.length} prior decisions</small></div><div className="boundary-card caution"><span>EXCLUDED AS HINDSIGHT</span><strong>{replay.hindsightExcludedEventIds.length} events · {replay.hindsightExcludedEvidenceIds.length} evidence</strong><small>Later knowledge cannot influence this replay.</small></div><div className="boundary-card"><span>APPLICABLE CONTROLS</span><strong>{replay.applicableControlIds.length} controls</strong><small>{replay.applicableControlIds.join(", ") || "none identified"}</small></div></div><div className="replay-columns"><div><div className="panel-label">ALTERNATIVE ACTIONS</div><div className="alternative-list">{alternatives.map((alternative) => { const result = results.find((item) => item.alternative.id === alternative.id); return <article className="alternative-card" key={alternative.id}><div><span className="event-type neutral">{alternative.kind.replaceAll("_", " ")}</span><h3>{alternative.label}</h3><p>{alternative.description}</p><small>{alternative.assumptions.join(" ")}</small></div><div className="alternative-action">{result ? <><span className="simulated-badge">SIMULATED</span><strong>{money(result.simulation.lossCents)}</strong><small>{result.resultHash.slice(0, 14)}…</small></> : <button className="ghost-btn" onClick={() => onSimulate(alternative)}>Run scenario</button>}</div></article>; })}</div></div><div className="quality-card"><div className="panel-label">DECISION QUALITY REVIEW</div><h3>Structured, not scored</h3>{quality?.policyRequirements.map((item) => <p key={item}>Policy · {item}</p>)}{quality?.interventionFeasibility.map((item) => <p key={item}>Feasibility · {item}</p>)}{quality?.expectedTradeoffs.map((item) => <p key={item}>Trade-off · {item}</p>)}{quality?.evidenceLimitations.map((item) => <p className="warning-text" key={item}>Limitation · {item}</p>)}</div></div><div className="branch-strip"><div><div className="panel-label">INVESTIGATION BRANCHES</div><p>Each branch is a frozen decision-time snapshot. The original investigation remains unchanged.</p></div><div className="branch-list">{branches.filter((branch) => branch.forkDecisionPointId === replay.decisionPoint.id).map((branch) => <div className="branch-chip" key={branch.id}><span>{branch.chosenAction.replaceAll("_", " ")}</span><strong>{branch.id}</strong><small>seed {branch.seed} · {branch.resultHash.slice(0, 12)}…</small></div>)}</div></div></>}</section>;
}

function Timeline({ timeline }: { timeline: ReturnType<typeof reconstructTimeline> }) {
  return <section className="timeline-panel"><div className="timeline-scale"><span>08 APR · EVENT TIME (UTC)</span><span>INGESTION LAG</span></div><div className="timeline-list">{timeline.map((event) => <article className="timeline-row" key={event.id}><div className="timeline-time"><strong>{event.eventTimeLabel}</strong><span>{event.id}</span></div><div className="timeline-line"><span className={`event-dot ${event.kind}`} /><span className="line" /></div><div className="event-card"><div className="event-top"><span className={`event-type ${event.kind}`}>{event.kind}</span><span className="source-ref">{event.sourceRef}</span></div><h3>{event.summary}</h3><p><span className="mono">{event.actorId}</span> · {event.accountId}{event.amountCents ? ` · ${money(event.amountCents)}` : ""}</p>{event.flags.length > 0 && <div className="flags">{event.flags.map((flag) => <span key={flag} className="flag">{flag.replaceAll("_", " ")}{flag === "ingestion_lag" && ` · ${event.ingestionLagMinutes}m`}</span>)}</div>}</div></article>)}</div></section>;
}

function EvidenceList({ evidence, comparison, onSelect }: { evidence: EvidenceRecord[]; comparison?: EvidenceChange; onSelect: (item: EvidenceRecord) => void }) {
  return <section className="evidence-panel">{comparison && <div className="comparison-banner"><div><span className="eyebrow">RECOMPUTED CONCLUSIONS</span><strong>{comparison.action} recorded for {comparison.evidenceId}</strong></div><div className="comparison-count"><span>before</span><strong>{comparison.before.filter((item) => item.causalStatus === "plausible").length} plausible</strong><span>after</span><strong>{comparison.after.filter((item) => item.causalStatus === "plausible").length} plausible</strong></div></div>}<div className="evidence-intro"><div><span className="legend-dot observed" />Observed fact <span className="legend-dot claim" />Reported claim <span className="legend-dot inferred" />Inferred relationship <span className="legend-dot assumption" />Assumption</div><span className="mono">{evidence.length} records · append-only history</span></div>{evidence.map((item) => <button className="evidence-row" key={item.id} onClick={() => onSelect(item)}><div className={`evidence-icon ${item.type}`}><Icon>{item.type === "observed_fact" ? "◈" : item.type === "reported_claim" ? "!" : item.type === "inferred_relationship" ? "⌁" : "△"}</Icon></div><div className="evidence-main"><div className="event-top"><span className="event-type neutral">{item.type.replaceAll("_", " ")}</span><span className={item.status === "active" ? "status-text green" : "status-text amber"}>{item.status}</span></div><h3>{item.title}</h3><p>{item.source} · {item.history.length} history entries</p></div><div className="evidence-right"><span className="mono">{item.integrityHash.slice(0, 18)}…</span><span>Inspect provenance →</span></div></button>)}</section>;
}

function CausalMap({ investigation, assessments, validation }: { investigation: Investigation; assessments: HypothesisAssessment[]; validation: ReturnType<typeof validateCausalGraph> }) {
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string | undefined>();
  const assessmentById = new Map(assessments.map((item) => [item.hypothesisId, item]));
  const selected = investigation.causalEdges.find((edge) => edge.id === selectedHypothesisId);
  const selectedAssessment = selected ? assessmentById.get(selected.id) : undefined;
  return <section className="causal-panel">{validation.issues.length > 0 && <div className="graph-warning"><strong>{validation.valid ? "Warnings" : "Graph invalid"}</strong>{validation.issues.map((issue) => <span key={`${issue.code}-${issue.hypothesisId ?? "graph"}`}>{issue.message}</span>)}</div>}<div className="graph-legend"><span><i className="edge-solid" /> causal interpretation</span><span><i className="edge-dashed" /> temporal correlation only</span><span className="mono">DAG CHECK: {validation.valid ? "PASSED" : "FAILED"}</span></div><div className="graph"><svg viewBox="0 0 900 380" role="img" aria-label="Directed causal graph"><defs><marker id="arrow" markerWidth="8" height="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#a49bff" /></marker></defs><path className="edge" d="M225 145 C315 145 325 100 400 100" markerEnd="url(#arrow)" /><path className="edge" d="M530 100 C620 100 620 145 700 145" markerEnd="url(#arrow)" /><path className="edge dashed" d="M225 215 C390 215 520 215 700 215" markerEnd="url(#arrow)" /><foreignObject x="50" y="95" width="180" height="100"><div className="node condition"><span>CONDITION</span><strong>Coordinated<br />account use</strong><small>evd-001 · evd-003</small></div></foreignObject><foreignObject x="395" y="50" width="180" height="100"><div className="node mechanism"><span>MECHANISM</span><strong>Monitoring<br />delay</strong><small>evd-002 challenged</small></div></foreignObject><foreignObject x="395" y="245" width="180" height="100"><div className="node mechanism"><span>MECHANISM</span><strong>Intervention<br />window missed</strong><small>assumption required</small></div></foreignObject><foreignObject x="680" y="95" width="180" height="100"><div className="node outcome"><span>OUTCOME</span><strong>€240k simulated<br />loss</strong><small>not observed prevention</small></div></foreignObject></svg></div><div className="hypothesis-cards">{investigation.causalEdges.map((edge) => { const assessment = assessmentById.get(edge.id); return <div className={`hypothesis selectable ${selectedHypothesisId === edge.id ? "selected" : ""}`} key={edge.id} role="button" tabIndex={0} onClick={() => setSelectedHypothesisId(edge.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedHypothesisId(edge.id); }}><div className="hypothesis-head"><span>{edge.id}</span><span className={assessment?.causalStatus === "plausible" ? "amber" : assessment?.causalStatus === "established" ? "green" : "red"}>{assessment?.causalStatus?.toUpperCase()}</span></div><h3>{edge.label}</h3><p>Assumption: {edge.assumptions.join(" ")}</p><div className="dependency-line"><span>support: {assessment?.activeSupportingEvidenceIds.join(", ") || "none active"}</span><span>contradict: {assessment?.activeContradictingEvidenceIds.join(", ") || "none active"}</span></div><div className="hypothesis-foot"><span>source reliability: {assessment?.sourceReliability.rating}</span><span>missing: {assessment?.missingEvidenceIds.join(", ") || "none"}</span>{assessment?.confounderNodeIds.length ? <span className="amber">possible confounders: {assessment.confounderNodeIds.join(", ")}</span> : null}{assessment?.warnings.map((warning) => <span className="warning-text" key={warning}>⚠ {warning}</span>)}</div></div>; })}</div>{selected && selectedAssessment && <div className="assumption-inspector"><div><span className="eyebrow">SELECTED HYPOTHESIS · {selected.id}</span><h3>{selected.label}</h3></div><div><span className="panel-label">IDENTIFICATION ASSUMPTIONS</span>{selectedAssessment.assumptions.map((assumption) => <p key={assumption}>↳ {assumption}</p>)}</div><div><span className="panel-label">DEPENDENCY INSPECTION</span><p>Supporting: {selectedAssessment.supportingEvidenceIds.join(", ") || "none"}</p><p>Contradicting: {selectedAssessment.contradictingEvidenceIds.join(", ") || "none"}</p><p>Missing: {selectedAssessment.missingEvidenceIds.join(", ") || "none"}</p></div></div>}</section>;
}

function Lab({ investigation, selectedControl, setSelectedControl, sensitivityBps, setSensitivityBps, simulation, onRun }: { investigation: Investigation; selectedControl: string; setSelectedControl: (value: string) => void; sensitivityBps: number; setSensitivityBps: (value: number) => void; simulation?: SimulationComparison; onRun: () => void }) {
  return <section className="lab-panel"><div className="lab-layout"><div className="control-list"><div className="panel-label">SELECT INTERVENTION</div>{investigation.controls.map((control) => <button className={selectedControl === control.id ? "control-card selected" : "control-card"} key={control.id} onClick={() => setSelectedControl(control.id)}><span className="control-radio" /><div><strong>{control.label}</strong><p>{control.description}</p><span className="control-meta">{control.interventionDelayMinutes}m delay · {Math.round(control.detectionLift * 100)}% illustrative lift</span></div></button>)}<div className="seed-box"><span>REPLAY SEED</span><strong className="mono">20261114</strong><small>Fixed seed · same inputs, same output</small></div><label className="sensitivity-label" htmlFor="sensitivity">Analyst sensitivity range <strong>±{sensitivityBps} bps</strong></label><input id="sensitivity" type="range" min="0" max="2500" step="50" value={sensitivityBps} onChange={(event) => setSensitivityBps(Number(event.target.value))} /><button className="primary-btn run-btn" onClick={onRun}><Icon>▶</Icon> Run deterministic simulation</button></div><div className="result-panel">{simulation ? <><div className="result-head"><div><span className="eyebrow">SIMULATION COMPARISON</span><h3>{investigation.controls.find((item) => item.id === simulation.intervention.controlId)?.label}</h3></div><span className="simulated-badge">SIMULATED</span></div><div className="result-numbers"><div><span>BASELINE REPLAY</span><strong>{money(simulation.baseline.lossCents)}</strong></div><div><span>INTERVENTION SCENARIO</span><strong className="green">{money(simulation.intervention.lossCents)}</strong></div></div><div className="comparison-delta"><span>MODELLED EXPOSURE DIFFERENCE</span><strong>{money(simulation.differenceCents)}</strong></div><div className="range"><div className="range-bar"><span style={{ width: `${Math.min(100, (simulation.intervention.uncertaintyCents.high / simulation.baseline.lossCents) * 100)}%`, left: `${Math.max(0, (simulation.intervention.uncertaintyCents.low / simulation.baseline.lossCents) * 100)}%` }} /><b style={{ left: `${Math.max(0, Math.min(100, (simulation.intervention.lossCents / simulation.baseline.lossCents) * 100))}%` }} /></div><div><span>declared sensitivity range</span><strong>{money(simulation.intervention.uncertaintyCents.low)} — {money(simulation.intervention.uncertaintyCents.high)}</strong></div></div><div className="assumption-box"><span>MODEL BOUNDARIES · INPUT {simulation.intervention.input.inputHash.slice(0, 18)}…</span>{simulation.intervention.assumptions.map((assumption) => <p key={assumption}>↳ {assumption}</p>)}</div></> : <div className="empty-result"><div className="empty-mark">△</div><h3>No scenario run yet</h3><p>Choose an intervention and run the seeded kernel to produce a reproducible baseline comparison with an explicit analyst sensitivity range.</p></div>}</div></div></section>;
}
