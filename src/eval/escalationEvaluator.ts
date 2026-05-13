import { ESCALATION_DECISIONS } from "../domain/invoice.js";
import type { WorkflowResult } from "../workflow/runWorkflow.js";
import type { GoldenCase } from "./goldenCases.js";

export type EscalationMetrics = {
  total: number;
  correct: number;
  accuracy: number;
};

/**
 * "Did the agent's escalate/not-escalate call match what the case expected?"
 * Computed across (case × repeat) so a flaky agent that escalates 3/5 times
 * for an escalation case contributes 3 correct + 2 wrong, not a single
 * average.
 *
 * Kept deliberately as a single accuracy number rather than precision/recall —
 * the latter is the right tool when you need to distinguish "bothered humans
 * for nothing" from "let risky cases through," which is an operational
 * concern that lives upstream of this PoC.
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
