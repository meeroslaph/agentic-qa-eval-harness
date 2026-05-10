import type { TraceEventName } from "../workflow/trace.js";
import type { GoldenCase } from "./goldenCases.js";
import type { WorkflowResult } from "../workflow/runWorkflow.js";

export type TrajectoryResult = {
  caseId: string;
  attempt: number;
  passed: boolean;
  missing: readonly TraceEventName[];
  actualSequence: readonly TraceEventName[];
};

/**
 * "Required events appear in order" is a deliberately loose check — strong enough
 * to detect skipped/reordered steps, but tolerant of additional events such as the
 * variable number of `business_rule.checked` emissions.
 */
export function evaluateTrajectory(c: GoldenCase, run: WorkflowResult): TrajectoryResult {
  const actual = run.trace.map((e) => e.name);
  const missing: TraceEventName[] = [];

  let cursor = 0;
  for (const required of c.expectedTrajectory) {
    const idx = actual.indexOf(required, cursor);
    if (idx === -1) {
      missing.push(required);
    } else {
      cursor = idx + 1;
    }
  }

  return {
    caseId: c.id,
    attempt: run.attempt,
    passed: missing.length === 0,
    missing,
    actualSequence: actual,
  };
}
