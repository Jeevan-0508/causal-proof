import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { exportReport } from "@/lib/domain/kernel";

type InvestigationReport = ReturnType<typeof exportReport>;

export async function buildInvestigationPdf(report: InvestigationReport): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const margin = 44;
  const pageWidth = 595;
  const pageHeight = 842;
  let page = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPageIfNeeded = (height = 16) => {
    if (y < margin + height) { page = document.addPage([pageWidth, pageHeight]); y = pageHeight - margin; }
  };
  const draw = (text: string, size = 9, isBold = false, color = rgb(0.18, 0.19, 0.24)) => {
    const activeFont = isBold ? bold : font;
    const maxWidth = pageWidth - margin * 2;
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (activeFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        newPageIfNeeded(size + 6);
        page.drawText(line, { x: margin, y, size, font: activeFont, color });
        y -= size + 4;
        line = word;
      } else line = candidate;
    }
    if (line) { newPageIfNeeded(size + 6); page.drawText(line, { x: margin, y, size, font: activeFont, color }); y -= size + 4; }
  };
  const gap = (amount = 8) => { y -= amount; };

  draw("CAUSAL//PROOF", 20, true, rgb(0.25, 0.24, 0.55));
  draw("Don't just find what happened. Test why.", 10, false, rgb(0.35, 0.36, 0.45));
  gap(10);
  draw(report.title, 15, true);
  draw(`Investigation ${report.investigationId} · report ${report.reportVersion} · generated ${report.generatedAt}`, 8, false, rgb(0.4, 0.41, 0.48));
  gap(10);
  draw("EXECUTIVE SUMMARY", 10, true, rgb(0.25, 0.24, 0.55));
  draw(report.executiveSummary);
  gap(8);
  draw(`CHRONOLOGY · ${report.chronology.length} records`, 10, true, rgb(0.25, 0.24, 0.55));
  for (const event of report.chronology) draw(`${event.eventTimeLabel} · ${event.kind} · ${event.summary} · ${event.sourceRef}`);
  gap(8);
  draw(`EVIDENCE · ${report.evidence.length} records`, 10, true, rgb(0.25, 0.24, 0.55));
  for (const evidence of report.evidence) draw(`${evidence.id} · ${evidence.status} · ${evidence.title} · available ${evidence.availableAt}`);
  gap(8);
  draw("CAUSAL HYPOTHESES", 10, true, rgb(0.25, 0.24, 0.55));
  for (const hypothesis of report.causalHypotheses) draw(`${hypothesis.hypothesisId} · ${hypothesis.causalStatus} · support ${hypothesis.activeSupportingEvidenceIds.join(", ") || "none"} · contradiction ${hypothesis.activeContradictingEvidenceIds.join(", ") || "none"}`);
  if (report.replay) {
    gap(8);
    draw("DECISION REPLAY", 10, true, rgb(0.25, 0.24, 0.55));
    for (const replay of report.replay.replays) draw(`${replay.decisionPoint.id} · cutoff ${replay.knowledgeCutoff} · known events ${replay.knownEventIds.length} · excluded later events ${replay.hindsightExcludedEventIds.length}`);
    for (const branch of report.replay.branches) draw(`branch ${branch.id} · ${branch.chosenAction} · seed ${branch.seed} · result ${branch.resultHash.slice(0, 22)}…`);
  }
  if (report.simulation) {
    gap(8);
    draw("SIMULATION · NOT HISTORICAL FACT", 10, true, rgb(0.55, 0.35, 0.12));
    draw(`Scenario ${report.simulation.controlId} · baseline ${report.simulation.baselineLossCents / 100} cents · result ${report.simulation.lossCents / 100} cents · input ${report.simulation.input.inputHash}`);
  }
  gap(8);
  draw("LIMITATIONS", 10, true, rgb(0.25, 0.24, 0.55));
  for (const limitation of report.limitations) draw(`• ${limitation}`);
  return document.save();
}
