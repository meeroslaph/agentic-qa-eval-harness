import type { TraceEvent, TraceEventName } from "../workflow/trace.js";
import type { GoldenCase } from "./goldenCases.js";
import type { WorkflowResult } from "../workflow/runWorkflow.js";

/**
 * A trajectory step is either a bare event name (the original loose check)
 * or `{ name, metadata }` where each declared metadata key must equal the
 * corresponding key on the actual event. This lets goldens assert on
 * intermediate state — e.g. "the router proposed compliance_review" — that
 * the outcome evaluator alone cannot catch (right answer, wrong path).
 */
export type TrajectoryStep =
  | TraceEventName
  | { readonly name: TraceEventName; readonly metadata: Readonly<Record<string, unknown>> };

export type TrajectoryResult = {
  caseId: string;
  attempt: number;
  passed: boolean;
  missing: readonly TrajectoryStep[];
  actualSequence: readonly TraceEventName[];
};

/**
 * "Required steps appear in order" with optional metadata partial-match.
 * Tolerant of extra events (e.g. multiple `business_rule.checked` emissions).
 */
export function evaluateTrajectory(c: GoldenCase, run: WorkflowResult): TrajectoryResult {
  const events = run.trace;
  const missing: TrajectoryStep[] = [];

  let cursor = 0;
  for (const step of c.expectedTrajectory) {
    let found = -1;
    for (let i = cursor; i < events.length; i++) {
      if (eventMatches(events[i]!, step)) {
        found = i;
        break;
      }
    }
    if (found === -1) {
      missing.push(step);
    } else {
      cursor = found + 1;
    }
  }

  return {
    caseId: c.id,
    attempt: run.attempt,
    passed: missing.length === 0,
    missing,
    actualSequence: events.map((e) => e.name),
  };
}

function eventMatches(event: TraceEvent, step: TrajectoryStep): boolean {
  if (typeof step === "string") return event.name === step;
  if (event.name !== step.name) return false;
  for (const [key, expected] of Object.entries(step.metadata)) {
    if (!deepEqual(event.metadata[key], expected)) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ka = Object.keys(ao);
    const kb = Object.keys(bo);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}
