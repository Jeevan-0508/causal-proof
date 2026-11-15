import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { exportReport } from "../lib/domain/kernel";
import { buildInvestigationPdf } from "../lib/report/pdf";

describe("PDF report generation", () => {
  it("produces a readable PDF artifact from the deterministic report", async () => {
    const bytes = await buildInvestigationPdf(exportReport(demoInvestigation, undefined, "2026-04-08T12:00:00+00:00"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});
