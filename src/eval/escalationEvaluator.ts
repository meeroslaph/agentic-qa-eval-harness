import { ESCALATION_DECISIONS } from "../domain/invoice.js";
import type { WorkflowResult } from "../workflow/runWorkflow.js";
import type { GoldenCase } from "./goldenCases.js";

export type EscalationMetrics = {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number;
  recall: number;
  total: number;
};

/**
 * Treat escalation as a binary classification: did the agent escalate, and
 * should it have? Computed across (case × repeat) so a flaky agent that
 * escalates 3/5 times for an escalation case still contributes 3 TP + 2 FN.
 */
export function evaluateEscalations(
  pairs: ReadonlyArray<{ goldenCase: GoldenCase; run: WorkflowResult }>,
): EscalationMetrics {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;

  for (const { goldenCase, run } of pairs) {
    const expectedEsc = ESCALATION_DECISIONS.has(goldenCase.expectedDecision);
    const actualEsc = ESCALATION_DECISIONS.has(run.decision);
    if (expectedEsc && actualEsc) tp++;
    else if (!expectedEsc && actualEsc) fp++;
    else if (!expectedEsc && !actualEsc) tn++;
    else fn++;
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);

  return {
    truePositive: tp,
    falsePositive: fp,
    trueNegative: tn,
    falseNegative: fn,
    precision: round(precision, 4),
    recall: round(recall, 4),
    total: tp + fp + tn + fn,
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
