import { describe, expect, it } from "vitest";
import { demoInvestigation } from "../lib/domain/demo";
import { exportReport, runCounterfactual } from "../lib/domain/kernel";

describe("reproducible reports", () => {
  it("produces equal reports for equal inputs and timestamp", () => {
    const simulation = runCounterfactual(demoInvestigation, "control-realtime", 20261114);
    const first = exportReport(demoInvestigation, simulation, "2026-04-08T12:00:00+00:00");
    const second = exportReport(demoInvestigation, simulation, "2026-04-08T12:00:00+00:00");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
