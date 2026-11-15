"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { demoInvestigation } from "@/lib/domain/demo";
import { parseEventImport } from "@/lib/domain/import";
import { changeEvidenceStatus, compareScenarios, deriveHypothesisAssessments, exportReport, reconstructTimeline, validateCausalGraph } from "@/lib/domain/kernel";
import { analyzeDecisionQuality, createInvestigationBranch, defaultDecisionAlternatives, evaluateDecisionAlternative, getDecisionPoints, replayDecisionPoint } from "@/lib/domain/replay";
import { buildInvestigationPdf } from "@/lib/report/pdf";
import type { DecisionAlternativeResult, DecisionQualityAnalysis, DecisionReplay, EvidenceChange, EvidenceRecord, HypothesisAssessment, Investigation, InvestigationBranch, SimulationComparison } from "@/lib/domain/types";
import type { InvestigationSummary } from "@/lib/persistence/sqlite";

const money = (cents: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

function Icon({ children }: { children: React.ReactNode }) { return <span className="icon" aria-hidden="true">{children}</span>; }

export default function Home() {
  const [activeTab, setActiveTab] = useState<"timeline" | "evidence" | "causal" | "replay" | "lab" | "library">("timeline");
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

  useEffect(() => {
    void (async () => {
      try {
        const listResponse = await fetch("/api/investigations", { cache: "no-store" });
        const listed = await listResponse.json() as { investigations?: InvestigationSummary[] };
        let id = listed.investigations?.[0]?.id;
        if (!id) {
          const created = await fetch("/api/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ investigation: demoInvestigation }) });
          const payload = await created.json() as { investigation: Investigation };
          id = payload.investigation.id;
        }
        const loaded = await fetch(`/api/investigations/${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = await loaded.json() as { investigation: Investigation; integrity: { status: typeof integrity }; branches?: InvestigationBranch[] };
        setInvestigation(payload.investigation);
        setBranches(payload.branches ?? []);
        setIntegrity(payload.integrity.status);
        const refreshed = await fetch("/api/investigations", { cache: "no-store" });
        setLibrary((await refreshed.json() as { investigations: InvestigationSummary[] }).investigations);
        setPersistenceMessage("Recovered from SQLite");
      } catch (error) {
        setPersistenceMessage(error instanceof Error ? `Local persistence unavailable: ${error.message}` : "Local persistence unavailable");
      } finally { hydrated.current = true; }
    })();
  }, []);

  async function persistInvestigation(next: Investigation) {
    if (!hydrated.current) return;
    try {
      const response = await fetch(`/api/investigations/${encodeURIComponent(next.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ investigation: next }) });
      const payload = await response.json() as { integrity?: { status: typeof integrity }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Save rejected");
      if (payload.integrity) setIntegrity(payload.integrity.status);
      setPersistenceMessage("Saved transactionally to SQLite");
      const refreshed = await fetch("/api/investigations", { cache: "no-store" });
      setLibrary((await refreshed.json() as { investigations: InvestigationSummary[] }).investigations);
    } catch (error) { setPersistenceMessage(error instanceof Error ? `Save failed: ${error.message}` : "Save failed"); }
  }

  function openEvidence(record: EvidenceRecord) {
    setSelectedEvidence(record);
    setEvidenceAction(record.status === "active" ? "challenge" : "restore");
    setChallengeDraft("");
  }

  function submitEvidenceAction() {
    if (!selectedEvidence || !challengeDraft.trim()) return;
    const result = changeEvidenceStatus(investigation, selectedEvidence.id, evidenceAction, challengeDraft);
    setInvestigation(result.investigation);
    void persistInvestigation(result.investigation);
    setChallengeComparison(result);
    setSelectedEvidence(null);
    setChallengeDraft("");
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
    const response = await fetch(`/api/investigations/${encodeURIComponent(investigation.id)}/package`);
    const pack = await response.json();
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${investigation.id.toLowerCase()}.causalproof.json`; link.click(); URL.revokeObjectURL(url);
  }

  async function verifyStoredIntegrity() {
    const response = await fetch(`/api/investigations/${encodeURIComponent(investigation.id)}/integrity`, { cache: "no-store" });
    const result = await response.json() as { status: typeof integrity; issues?: string[] };
    setIntegrity(result.status);
    setPersistenceMessage(result.status === "verified" ? "Local chain consistent; authenticity remains unknown" : `Integrity failure: ${result.issues?.join(" ") ?? "unknown"}`);
  }

  function selectDecision(decisionId: string) {
    setSelectedDecisionId(decisionId);
    const replay = replayDecisionPoint(investigation, decisionId);
    setReplays((current) => [...current.filter((item) => item.replayId !== replay.replayId), replay]);
    setDecisionQuality((current) => [...current.filter((item) => item.decisionPointId !== replay.decisionPoint.id), analyzeDecisionQuality(investigation, replay)]);
    if (hydrated.current) void fetch(`/api/investigations/${encodeURIComponent(investigation.id)}/replays`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replay }) });
  }

  function simulateAlternative(alternative: Parameters<typeof evaluateDecisionAlternative>[2]) {
    if (!currentReplay) return;
    const result = evaluateDecisionAlternative(investigation, currentReplay, alternative, 20261114);
    const branch = createInvestigationBranch(investigation, currentReplay, result);
    setAlternativeResults((current) => [...current.filter((item) => item.alternative.id !== alternative.id), result]);
    setBranches((current) => [...current.filter((item) => item.id !== branch.id), branch]);
    if (hydrated.current) void (async () => {
      await fetch(`/api/investigations/${encodeURIComponent(investigation.id)}/replays`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replay: currentReplay }) });
      const response = await fetch(`/api/investigations/${encodeURIComponent(investigation.id)}/branches`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branch, simulation: result.simulation }) });
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
      const response = await fetch("/api/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ investigation: imported }) });
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
      </nav>
      <div className="rail-bottom"><div className="system"><span className="status-dot" />Local kernel online</div><div className="version">CAUSAL//PROOF <span>v0.2</span></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div className="crumb"><span>INVESTIGATIONS</span><b>/</b> {investigation.id}</div><div className="top-actions"><span className="local-badge"><span className="status-dot" />LOCAL ONLY</span><span className={`integrity-chip ${integrity}`} title="Integrity consistency is not evidence truth"><span className="status-dot" />{integrity === "verified" ? "CHAIN CONSISTENT" : integrity === "integrity_failure" ? "INTEGRITY FAILURE" : "AUTHENTICITY UNKNOWN"}</span><input ref={fileInput} type="file" accept=".json,.csv,application/json,text/csv" onChange={importEvents} hidden /><button className="ghost-btn" onClick={() => fileInput.current?.click()}><Icon>↑</Icon> Import events</button><button className="ghost-btn" onClick={downloadPackage}><Icon>⇩</Icon> Package</button><button className="ghost-btn" onClick={downloadReport}><Icon>↓</Icon> JSON</button><button className="ghost-btn" onClick={downloadPdf}><Icon>↓</Icon> PDF</button><button className="ghost-btn" onClick={verifyStoredIntegrity}>Verify chain</button><div className="avatar">R</div></div></header>
      <div className="content">
        {importError && <div className="warning-banner"><strong>Import rejected.</strong> {importError}<button onClick={() => setImportError(undefined)} aria-label="Dismiss import error">×</button></div>}
        <div className="title-row"><div><p className="eyebrow">OPEN INVESTIGATION <span className="pill">{investigation.status}</span></p><h1>{investigation.title}</h1><p className="subtitle">Synthetic logistics-fraud scenario <span className="mono">·</span> opened 08 Apr 2026</p></div><div className="headline-stat"><span>SIMULATED EXPOSURE</span><strong>{money(totalLoss)}</strong><small>observed transaction total in scenario</small></div></div>
        <div className="metric-grid"><div className="metric"><span>EVENTS</span><strong>{String(investigation.events.length).padStart(2, "0")}</strong><small>chronological records</small></div><div className="metric"><span>ACTORS / ACCOUNTS</span><strong>04 / 03</strong><small>distinct entities</small></div><div className="metric"><span>EVIDENCE</span><strong>{String(investigation.evidence.length).padStart(2, "0")}</strong><small>{challengedCount} challenged or withdrawn</small></div><div className="metric"><span>CAUSAL EDGES</span><strong>{String(investigation.causalEdges.length).padStart(2, "0")}</strong><small>{validation.valid ? "DAG checks passed" : "graph requires repair"}</small></div></div>
        <div className="module-head"><div><p className="eyebrow">MODULE 0{["timeline", "evidence", "causal", "replay", "lab", "library"].indexOf(activeTab) + 1}</p><h2>{activeTab === "timeline" ? "Incident reconstruction" : activeTab === "evidence" ? "Evidence intelligence" : activeTab === "causal" ? "Causal hypothesis map" : activeTab === "replay" ? "Decision replay" : activeTab === "lab" ? "Counterfactual laboratory" : "Investigation library"}</h2></div><p className="module-note">{activeTab === "timeline" ? "Event time is primary. Ingestion lag is retained, never overwritten." : activeTab === "evidence" ? "Challenges are append-only. Conclusions recalculate from active evidence." : activeTab === "causal" ? "Edges require assumptions. Correlation is marked separately from identification." : activeTab === "replay" ? "Historical knowledge boundaries prevent hindsight leakage." : activeTab === "lab" ? "Seeded execution makes each scenario reproducible." : persistenceMessage}</p></div>

        {activeTab === "timeline" && <Timeline timeline={timeline} />}
        {activeTab === "evidence" && <EvidenceList evidence={investigation.evidence} comparison={challengeComparison} onSelect={openEvidence} />}
        {activeTab === "causal" && <CausalMap investigation={investigation} assessments={assessments} validation={validation} />}
        {activeTab === "replay" && <ReplayPanel investigation={investigation} decisionPoints={decisionPoints} selectedDecisionId={selectedDecisionId} onSelectDecision={selectDecision} replay={currentReplay} alternatives={currentAlternatives} results={alternativeResults} branches={branches} quality={currentQuality} onSimulate={simulateAlternative} />}
        {activeTab === "lab" && <Lab investigation={investigation} selectedControl={selectedControl} setSelectedControl={(controlId) => { setSelectedControl(controlId); const control = investigation.controls.find((item) => item.id === controlId); if (control) setSensitivityBps(control.sensitivityBps); }} sensitivityBps={sensitivityBps} setSensitivityBps={setSensitivityBps} simulation={simulation} onRun={() => setSimulation(compareScenarios(investigation, selectedControl, 20261114, sensitivityBps))} />}
        {activeTab === "library" && <InvestigationLibrary investigations={library} currentId={investigation.id} onSelect={async (id) => { const response = await fetch(`/api/investigations/${encodeURIComponent(id)}`); const payload = await response.json() as { investigation: Investigation; integrity: { status: typeof integrity }; branches?: InvestigationBranch[] }; if (payload.investigation) { setInvestigation(payload.investigation); setBranches(payload.branches ?? []); setIntegrity(payload.integrity.status); setActiveTab("timeline"); } }} />}

        <footer className="integrity-footer"><span><span className="status-dot" />{persistenceMessage}</span><span>Chain consistency is not authenticity or evidence truth</span></footer>
      </div>
    </section>

    {selectedEvidence && <EvidenceDrawer evidence={selectedEvidence} action={evidenceAction} setAction={setEvidenceAction} draft={challengeDraft} setDraft={setChallengeDraft} onClose={() => setSelectedEvidence(null)} onSubmit={submitEvidenceAction} />}
  </main>;
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
