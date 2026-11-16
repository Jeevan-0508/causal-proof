import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DecisionAlternative, DecisionAlternativeResult, EvidenceChange, Investigation, SimulationComparison } from "../../lib/domain/types";
import {
  SHOWCASE_VERSION,
  PUBLIC_DATA_NOTICE,
  applyShowcaseEvidenceChange,
  buildShowcaseSnapshot,
  createShowcaseInvestigation,
  decisionReplay,
  formatEuro,
  runShowcaseAlternative,
  runShowcaseSimulation,
} from "./showcase-engine";
import "./styles.css";

const clone = (value: Investigation): Investigation => JSON.parse(JSON.stringify(value)) as Investigation;
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "danger" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function App() {
  const [investigation, setInvestigation] = useState(createShowcaseInvestigation);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("evd-001");
  const [selectedHypotheses, setSelectedHypotheses] = useState(["edge-1", "edge-2"]);
  const [selectedControl, setSelectedControl] = useState("control-realtime");
  const [seed, setSeed] = useState(20261114);
  const [sensitivity, setSensitivity] = useState(700);
  const [simulation, setSimulation] = useState<SimulationComparison | null>(null);
  const [alternativeResult, setAlternativeResult] = useState<DecisionAlternativeResult | null>(null);
  const [challengeAction, setChallengeAction] = useState<EvidenceChange["action"]>("challenge");
  const [challengeReason, setChallengeReason] = useState("Interpretation requires independent corroboration.");
  const [lastChange, setLastChange] = useState<EvidenceChange | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const snapshot = useMemo(() => buildShowcaseSnapshot(investigation, cutoff, selectedHypotheses), [investigation, cutoff, selectedHypotheses]);
  const replay = snapshot.replay;
  const selectedEvidence = investigation.evidence.find((record) => record.id === selectedEvidenceId) ?? investigation.evidence[0];

  const toggleHypothesis = (id: string) => setSelectedHypotheses((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  const runSimulation = () => setSimulation(runShowcaseSimulation(investigation, selectedControl, seed, sensitivity));
  const challengeEvidence = () => {
    if (!selectedEvidence) return;
    try {
      const result = applyShowcaseEvidenceChange(investigation, selectedEvidence.id, challengeAction, challengeReason);
      setInvestigation(result.investigation);
      setLastChange(result);
    } catch (error) {
      setLastChange(null);
      window.alert(error instanceof Error ? error.message : "Evidence change rejected.");
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CAUSAL//PROOF <span>PUBLIC SHOWCASE</span></p>
          <h1>Evidence before certainty.</h1>
          <p className="lede">A browser-only tour of a synthetic investigation: inspect what was observed, what remains unresolved, and how bounded scenarios change when assumptions change.</p>
        </div>
        <div className="header-meta">
          <StatusPill tone="good">STATIC / NO BACKEND</StatusPill>
          <span className="version">{SHOWCASE_VERSION}</span>
        </div>
      </header>

      <section className="notice" aria-label="Public showcase boundary">
        <span className="notice-mark">◈</span>
        <div><strong>Public synthetic workspace</strong><p>{PUBLIC_DATA_NOTICE}</p></div>
      </section>

      <nav className="section-nav" aria-label="Showcase sections">
        <a href="#timeline-heading">Timeline</a>
        <a href="#graph-heading">Graph</a>
        <a href="#hypothesis-heading">Hypotheses</a>
        <a href="#evidence-heading">Evidence</a>
        <a href="#simulation-heading">Simulation</a>
        <a href="#replay-heading">Replay</a>
      </nav>

      <section className="metric-grid" aria-label="Investigation summary">
        <article className="metric"><span>Investigation</span><strong>{investigation.id}</strong><small>{investigation.title}</small></article>
        <article className="metric"><span>Events</span><strong>{investigation.events.length}</strong><small>chronology rows</small></article>
        <article className="metric"><span>Evidence</span><strong>{investigation.evidence.filter((item) => item.status === "active").length}<em>/{investigation.evidence.length}</em></strong><small>currently active</small></article>
        <article className="metric"><span>Graph warnings</span><strong>{snapshot.graphValidation.issues.length}</strong><small>review before intervention</small></article>
      </section>

      <div className="workspace-grid">
        <section className="panel timeline-panel" aria-labelledby="timeline-heading">
          <div className="panel-heading"><div><p className="kicker">01 / forensic clocks</p><h2 id="timeline-heading">Timeline & historical replay</h2></div><label className="compact-control">Knowledge cutoff<select aria-label="Historical knowledge cutoff" value={cutoff ?? "all"} onChange={(event) => setCutoff(event.target.value === "all" ? null : event.target.value)}><option value="all">All available records</option>{replay && <option value={replay.knowledgeCutoff}>{dateLabel(replay.knowledgeCutoff)} · decision boundary</option>}</select></label></div>
          <p className="panel-copy">Occurrence, ingestion, availability, and knowledge are different clocks. The cutoff removes records that were not knowable at the decision.</p>
          <div className="timeline" role="list">
            {snapshot.timeline.map((row) => <button className={`timeline-row ${row.kind} ${row.flags.length ? "flagged" : ""}`} key={row.id} role="listitem" onClick={() => row.evidence ? setSelectedEvidenceId(row.evidence.id) : undefined}><span className="timeline-time">{dateLabel(row.availableAt)}</span><span className="timeline-dot" aria-hidden="true" /><span className="timeline-body"><strong>{row.label}</strong><small>{row.kind} · {row.source}</small>{row.flags.length > 0 && <span className="row-flags">{row.flags.join(" · ")}</span>}</span></button>)}
          </div>
          {cutoff && replay && <div className="replay-strip"><div><span className="kicker">Decision-time snapshot</span><strong>{replay.knownEventIds.length} events · {replay.knownEvidenceIds.length} evidence records known</strong></div><span className="muted">{replay.hindsightExcludedEventIds.length} later events excluded</span></div>}
        </section>

        <section className="panel graph-panel" aria-labelledby="graph-heading">
          <div className="panel-heading"><div><p className="kicker">02 / causal structure</p><h2 id="graph-heading">Graph inspection</h2></div><StatusPill tone={snapshot.graphValidation.valid ? "good" : "danger"}>{snapshot.graphValidation.valid ? "STRUCTURE VALID" : "INVALID GRAPH"}</StatusPill></div>
          <p className="panel-copy">Edges are hypotheses, not verdicts. Select a node or edge to inspect its assumptions, evidence, and missing identification inputs.</p>
          <div className="graph-canvas" aria-label="Interactive causal graph">
            {investigation.causalNodes.map((node, index) => <button key={node.id} className={`graph-node node-${index + 1} ${selectedNode === node.id ? "selected" : ""}`} onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}><span>{node.kind}</span><strong>{node.label}</strong></button>)}
            <div className="graph-lines" aria-hidden="true"><i /><i /><i /></div>
          </div>
          <div className="edge-list">{investigation.causalEdges.map((edge) => { const assessment = snapshot.assessments.find((item) => item.hypothesisId === edge.id); return <button key={edge.id} className={`edge-card ${selectedNode === edge.from || selectedNode === edge.to ? "related" : ""}`} onClick={() => setSelectedNode(edge.from)}><span className="edge-label">{edge.from} → {edge.to}</span><strong>{edge.label}</strong><StatusPill tone={assessment?.causalStatus === "plausible" ? "warn" : "danger"}>{assessment?.causalStatus ?? edge.causalStatus}</StatusPill><small>{assessment?.warnings[0] ?? "No active warning."}</small></button>; })}</div>
          {snapshot.graphValidation.issues.length > 0 && <div className="warning-box" role="alert"><strong>Guardrails active</strong>{snapshot.graphValidation.issues.map((issue) => <span key={`${issue.code}-${issue.hypothesisId ?? "graph"}`}>{issue.message}</span>)}</div>}
        </section>

        <section className="panel hypothesis-panel" aria-labelledby="hypothesis-heading">
          <div className="panel-heading"><div><p className="kicker">03 / competing explanations</p><h2 id="hypothesis-heading">Hypothesis comparison</h2></div><span className="muted">Select up to three</span></div>
          <div className="hypothesis-list">{snapshot.assessments.map((assessment) => { const edge = investigation.causalEdges.find((item) => item.id === assessment.hypothesisId)!; return <label className={`hypothesis-card ${selectedHypotheses.includes(assessment.hypothesisId) ? "selected" : ""}`} key={assessment.hypothesisId}><input type="checkbox" checked={selectedHypotheses.includes(assessment.hypothesisId)} onChange={() => toggleHypothesis(assessment.hypothesisId)} /><span><strong>{edge.label}</strong><small>{edge.from} → {edge.to} · {assessment.activeSupportingEvidenceIds.length} active supports · {assessment.missingEvidenceIds.length} missing</small></span><StatusPill tone={assessment.causalStatus === "plausible" ? "warn" : "danger"}>{assessment.causalStatus}</StatusPill></label>; })}</div>
          <div className="comparison"><span className="kicker">Shared / differentiating evidence</span>{snapshot.comparison.hypothesisIds.length > 1 ? <><p><strong>Shared support:</strong> {snapshot.comparison.sharedSupportingEvidenceIds.join(", ") || "none"}</p><p><strong>Shared contradictions:</strong> {snapshot.comparison.sharedContradictingEvidenceIds.join(", ") || "none"}</p><p><strong>Unresolved gaps:</strong> {snapshot.comparison.unresolvedMissingEvidenceIds.join(", ") || "none"}</p></> : <p className="muted">Select at least two hypotheses to compare their evidence dependencies.</p>}</div>
        </section>

        <section className="panel evidence-panel" aria-labelledby="evidence-heading">
          <div className="panel-heading"><div><p className="kicker">04 / provenance laboratory</p><h2 id="evidence-heading">Evidence inspection</h2></div><StatusPill tone={selectedEvidence?.status === "active" ? "good" : "warn"}>{selectedEvidence?.status ?? "unknown"}</StatusPill></div>
          <div className="evidence-tabs" role="tablist" aria-label="Evidence records">{investigation.evidence.map((record) => <button role="tab" aria-selected={record.id === selectedEvidence?.id} className={record.id === selectedEvidence?.id ? "active" : ""} key={record.id} onClick={() => setSelectedEvidenceId(record.id)}>{record.id}</button>)}</div>
          {selectedEvidence && <div className="evidence-detail"><div className="detail-title"><div><h3>{selectedEvidence.title}</h3><p>{selectedEvidence.type} · {selectedEvidence.source}</p></div><span className="hash">{selectedEvidence.originalIntegrityHash.slice(0, 24)}…</span></div><dl className="detail-grid"><div><dt>Observed</dt><dd>{dateLabel(selectedEvidence.observedAt)}</dd></div><div><dt>Available</dt><dd>{dateLabel(selectedEvidence.availableAt)}</dd></div><div><dt>Original payload</dt><dd>{JSON.stringify(selectedEvidence.originalPayload)}</dd></div><div><dt>Challenges</dt><dd>{selectedEvidence.challenges.length ? selectedEvidence.challenges.join(" · ") : "No challenge recorded"}</dd></div></dl><div className="challenge-form"><label>Action<select aria-label="Evidence status action" value={challengeAction} onChange={(event) => setChallengeAction(event.target.value as EvidenceChange["action"])}><option value="challenge">Challenge interpretation</option><option value="withdraw">Withdraw evidence</option><option value="restore">Restore evidence</option></select></label><label>Reason<textarea aria-label="Evidence challenge reason" value={challengeReason} onChange={(event) => setChallengeReason(event.target.value)} /></label><button className="primary-button" onClick={challengeEvidence}>Record change & recompute</button></div></div>}
          {lastChange && <div className="change-result" role="status"><strong>{lastChange.evidenceId} is now {lastChange.investigation.evidence.find((record) => record.id === lastChange.evidenceId)?.status}.</strong><span>{lastChange.before.filter((item, index) => item.causalStatus !== lastChange.after[index]?.causalStatus).length} dependent hypothesis status changes · immutable challenge history retained.</span></div>}
        </section>

        <section className="panel simulation-panel" aria-labelledby="simulation-heading">
          <div className="panel-heading"><div><p className="kicker">05 / bounded scenarios</p><h2 id="simulation-heading">Counterfactual sandbox</h2></div><StatusPill tone="warn">ILLUSTRATIVE ONLY</StatusPill></div>
          <p className="panel-copy">Change only explicit inputs. The engine does not invent an empirical distribution or describe simulated avoided loss as a historical fact.</p>
          <div className="simulation-controls"><label>Control<select aria-label="Simulation control" value={selectedControl} onChange={(event) => setSelectedControl(event.target.value)}>{investigation.controls.map((control) => <option value={control.id} key={control.id}>{control.label}</option>)}</select></label><label>Seed<input aria-label="Simulation seed" type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label><label>Sensitivity <output>{sensitivity} bps</output><input aria-label="Simulation sensitivity" type="range" min="0" max="2500" step="50" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} /></label><button className="primary-button" onClick={runSimulation}>Run deterministic comparison</button></div>
          {simulation && <div className="simulation-result"><div className="scenario baseline"><span>Baseline</span><strong>{formatEuro(simulation.baseline.lossCents)}</strong><small>observed synthetic loss</small></div><div className="scenario intervention"><span>Scenario</span><strong>{formatEuro(simulation.intervention.lossCents)}</strong><small>illustrative modeled loss</small></div><div className="scenario difference"><span>Difference</span><strong>{formatEuro(simulation.differenceCents)}</strong><small>range {formatEuro(simulation.intervention.uncertaintyCents.low)}–{formatEuro(simulation.intervention.uncertaintyCents.high)}</small></div><p className="assumption-note">Seed {simulation.intervention.seed} · {simulation.intervention.assumptions[1]}</p></div>}
        </section>

        <section className="panel replay-panel" aria-labelledby="replay-heading">
          <div className="panel-heading"><div><p className="kicker">06 / decision replay</p><h2 id="replay-heading">What was knowable then?</h2></div><StatusPill tone="good">NO HINDSIGHT</StatusPill></div>
          {replay ? <><div className="replay-summary"><div><span>Decision</span><strong>{replay.decisionPoint.summary}</strong><small>{dateLabel(replay.knowledgeCutoff)} knowledge cutoff</small></div><div><span>Known at boundary</span><strong>{replay.knownEventIds.length} events / {replay.knownEvidenceIds.length} evidence</strong><small>{replay.unresolvedEvidenceIds.length} unresolved inputs</small></div></div><div className="alternatives">{snapshot.alternatives.map((alternative) => <button key={alternative.id} className="alternative-card" onClick={() => setAlternativeResult(runShowcaseAlternative(investigation, alternative, seed))}><strong>{alternative.label}</strong><small>{alternative.description}</small></button>)}</div>{alternativeResult && <div className="alternative-result" role="status"><strong>{alternativeResult.alternative.label}: {formatEuro(alternativeResult.simulation.lossCents)} modeled loss</strong><span>Feasible: {alternativeResult.feasible ? "yes" : "no"} · historical fact: {String(alternativeResult.historicalFact)} · result hash {alternativeResult.resultHash.slice(0, 20)}…</span></div>}</> : <p>No decision point is available in this synthetic packet.</p>}
        </section>
      </div>

      <footer className="footer"><span>CAUSAL//PROOF · public showcase · {SHOWCASE_VERSION}</span><span>Observational evidence does not prove causation.</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
