import type { Decision } from "../domain/invoice.js";
import type { WorkflowResult } from "../workflow/runWorkflow.js";

export type ConsistencyResult = {
  caseId: string;
  totalRuns: number;
  uniqueDecisions: readonly Decision[];
  decisionCounts: Record<string, number>;
  consistent: boolean;
};

/**
 * The marquee evaluator. Repeats per case are mandatory because non-deterministic
 * agents can pass once and fail twice on the same input — single-shot pass/fail
 * is not a meaningful signal.
 */
export function evaluateConsistency(
  caseId: string,
  runs: readonly WorkflowResult[],
): ConsistencyResult {
  const counts: Record<string, number> = {};
  for (const r of runs) {
    counts[r.decision] = (counts[r.decision] ?? 0) + 1;
  }
  const uniqueDecisions = Object.keys(counts) as Decision[];
  return {
    caseId,
    totalRuns: runs.length,
    uniqueDecisions,
    decisionCounts: counts,
    consistent: uniqueDecisions.length === 1,
  };
}
