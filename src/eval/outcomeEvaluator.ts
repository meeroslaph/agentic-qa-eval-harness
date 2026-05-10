import type { GoldenCase } from "./goldenCases.js";
import type { WorkflowResult } from "../workflow/runWorkflow.js";

export type OutcomeResult = {
  caseId: string;
  attempt: number;
  passed: boolean;
  expectedDecision: string;
  actualDecision: string;
  expectedRoute: string;
  actualRoute: string;
};

export function evaluateOutcome(c: GoldenCase, run: WorkflowResult): OutcomeResult {
  const passed =
    run.decision === c.expectedDecision && run.route === c.expectedRoute;
  return {
    caseId: c.id,
    attempt: run.attempt,
    passed,
    expectedDecision: c.expectedDecision,
    actualDecision: run.decision,
    expectedRoute: c.expectedRoute,
    actualRoute: run.route,
  };
}
