import { ESCALATION_DECISIONS } from "../domain/invoice.js";
import type { WorkflowResult } from "../workflow/runWorkflow.js";
import type { GoldenCase } from "./goldenCases.js";

export type EscalationMetrics = {
  total: number;
  correct: number;
  accuracy: number;
};

/**
 * Did the agent's escalate/not-escalate call match what the case expected?
 * Computed across (case x repeat), so a flaky agent that escalates 3 of 5
 * times for an escalation case counts as 3 correct and 2 wrong rather than a
 * single average.
 *
 * This stays a single accuracy number rather than precision/recall. The split
 * matters once you need to tell "bothered humans for nothing" apart from "let
 * risky cases through," which is an operational concern beyond this PoC.
 */
export function evaluateEscalations(
  pairs: ReadonlyArray<{ goldenCase: GoldenCase; run: WorkflowResult }>,
): EscalationMetrics {
  let correct = 0;
  for (const { goldenCase, run } of pairs) {
    const expectedEsc = ESCALATION_DECISIONS.has(goldenCase.expectedDecision);
    const actualEsc = ESCALATION_DECISIONS.has(run.decision);
    if (expectedEsc === actualEsc) correct++;
  }

  const total = pairs.length;
  return {
    total,
    correct,
    accuracy: total === 0 ? 1 : round(correct / total, 4),
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
