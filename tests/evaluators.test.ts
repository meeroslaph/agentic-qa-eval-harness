import { describe, expect, it } from "vitest";
import { evaluateConsistency } from "../src/eval/consistencyEvaluator.js";
import { aggregateCostLatency } from "../src/eval/costEvaluator.js";
import { evaluateEscalations } from "../src/eval/escalationEvaluator.js";
import { evaluateOutcome } from "../src/eval/outcomeEvaluator.js";
import { evaluateTrajectory } from "../src/eval/trajectoryEvaluator.js";
import { GOLDEN_CASES } from "../src/eval/goldenCases.js";
import { runEvalSuite } from "../src/eval/runEvalSuite.js";
import {
  DeterministicMockModelClient,
  FlakyMockModelClient,
} from "../src/workflow/mockModelClient.js";
import type { WorkflowResult } from "../src/workflow/runWorkflow.js";
import type { GoldenCase } from "../src/eval/goldenCases.js";

const sampleCase = GOLDEN_CASES[0]!;

function makeRun(overrides: Partial<WorkflowResult> = {}): WorkflowResult {
  return {
    caseId: sampleCase.id,
    attempt: 1,
    decision: "APPROVE",
    route: "auto_approve",
    trace: [
      { ts: 1, name: "intake.started", component: "intake-agent", metadata: {}, costUnits: 0, latencyMs: 1 },
      { ts: 2, name: "intake.completed", component: "intake-agent", metadata: {}, costUnits: 0, latencyMs: 1 },
      { ts: 3, name: "routing.started", component: "router", metadata: {}, costUnits: 0, latencyMs: 1 },
      { ts: 4, name: "routing.completed", component: "router", metadata: {}, costUnits: 0, latencyMs: 1 },
      { ts: 5, name: "review.started", component: "reviewer-agent", metadata: {}, costUnits: 0, latencyMs: 1 },
      { ts: 6, name: "review.completed", component: "reviewer-agent", metadata: {}, costUnits: 0, latencyMs: 1 },
      { ts: 7, name: "workflow.completed", component: "orchestrator", metadata: {}, costUnits: 0, latencyMs: 1 },
    ],
    totalCostUnits: 0.001,
    totalLatencyMs: 7,
    ...overrides,
  };
}

describe("outcomeEvaluator", () => {
  it("passes when decision and route match", () => {
    const r = evaluateOutcome(sampleCase, makeRun());
    expect(r.passed).toBe(true);
  });
  it("fails when decision diverges", () => {
    const r = evaluateOutcome(sampleCase, makeRun({ decision: "REJECT", route: "reject" }));
    expect(r.passed).toBe(false);
  });
});

describe("trajectoryEvaluator", () => {
  it("passes when all required events appear in order", () => {
    const r = evaluateTrajectory(sampleCase, makeRun());
    expect(r.passed).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("fails when an event is missing", () => {
    const run = makeRun();
    const trace = run.trace.filter((e) => e.name !== "review.started");
    const r = evaluateTrajectory(sampleCase, { ...run, trace });
    expect(r.passed).toBe(false);
    expect(r.missing).toContain("review.started");
  });

  it("fails when events are out of order", () => {
    const run = makeRun();
    const reordered = [...run.trace];
    [reordered[2], reordered[5]] = [reordered[5]!, reordered[2]!];
    const r = evaluateTrajectory(sampleCase, { ...run, trace: reordered });
    expect(r.passed).toBe(false);
  });

  it("passes when a metadata predicate matches the actual event", () => {
    const caseWithMeta: GoldenCase = {
      ...sampleCase,
      expectedTrajectory: [
        "intake.started",
        { name: "routing.completed", metadata: { proposedRoute: "auto_approve" } },
        "workflow.completed",
      ],
    };
    const run = makeRun();
    const traceWithMeta = run.trace.map((e) =>
      e.name === "routing.completed" ? { ...e, metadata: { proposedRoute: "auto_approve" } } : e,
    );
    const r = evaluateTrajectory(caseWithMeta, { ...run, trace: traceWithMeta });
    expect(r.passed).toBe(true);
  });

  it("fails when a metadata predicate does not match (right event, wrong path)", () => {
    const caseWithMeta: GoldenCase = {
      ...sampleCase,
      expectedTrajectory: [
        { name: "routing.completed", metadata: { proposedRoute: "compliance_review" } },
      ],
    };
    const run = makeRun();
    const traceWithMeta = run.trace.map((e) =>
      e.name === "routing.completed" ? { ...e, metadata: { proposedRoute: "manager_review" } } : e,
    );
    const r = evaluateTrajectory(caseWithMeta, { ...run, trace: traceWithMeta });
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual([
      { name: "routing.completed", metadata: { proposedRoute: "compliance_review" } },
    ]);
  });
});

describe("consistencyEvaluator", () => {
  it("flags consistent runs as consistent", () => {
    const runs = [makeRun(), makeRun({ attempt: 2 })];
    expect(evaluateConsistency(sampleCase.id, runs).consistent).toBe(true);
  });

  it("flags divergent runs as inconsistent", () => {
    const runs = [
      makeRun(),
      makeRun({ attempt: 2, decision: "REJECT", route: "reject" }),
    ];
    const r = evaluateConsistency(sampleCase.id, runs);
    expect(r.consistent).toBe(false);
    expect(r.uniqueDecisions.length).toBe(2);
  });
});

describe("costEvaluator", () => {
  it("aggregates costs and computes p95 latency", () => {
    const runs: WorkflowResult[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(
      (l, i) => makeRun({ attempt: i + 1, totalLatencyMs: l, totalCostUnits: 0.001 }),
    );
    const agg = aggregateCostLatency(runs);
    expect(agg.totalRuns).toBe(10);
    expect(agg.totalCostUnits).toBeCloseTo(0.01, 6);
    expect(agg.p95LatencyMs).toBeGreaterThanOrEqual(90);
  });
});

describe("escalationEvaluator", () => {
  it("computes precision and recall correctly", () => {
    const escCase = GOLDEN_CASES.find((c) => c.id === "gc-002-high-amount-manager")!;
    const approveCase: GoldenCase = sampleCase;
    const pairs = [
      { goldenCase: escCase, run: makeRun({ decision: "ESCALATE_MANAGER", route: "manager_review" }) },
      { goldenCase: escCase, run: makeRun({ decision: "APPROVE", route: "auto_approve" }) }, // FN
      { goldenCase: approveCase, run: makeRun({ decision: "APPROVE", route: "auto_approve" }) }, // TN
      { goldenCase: approveCase, run: makeRun({ decision: "ESCALATE_MANAGER", route: "manager_review" }) }, // FP
    ];
    const m = evaluateEscalations(pairs);
    expect(m.truePositive).toBe(1);
    expect(m.falseNegative).toBe(1);
    expect(m.trueNegative).toBe(1);
    expect(m.falsePositive).toBe(1);
    expect(m.precision).toBeCloseTo(0.5, 4);
    expect(m.recall).toBeCloseTo(0.5, 4);
  });
});

describe("runEvalSuite (integration)", () => {
  it("deterministic mode produces a clean baseline", async () => {
    const report = await runEvalSuite({
      model: new DeterministicMockModelClient(),
      mode: "deterministic",
      runsPerCase: 3,
    });
    expect(report.summary.outcomePassRate).toBe(1);
    expect(report.summary.consistencyRate).toBe(1);
    expect(report.summary.failedCases).toEqual([]);
    expect(report.summary.unstableCases).toEqual([]);
  });

  it("flaky mode demonstrates at least one inconsistency", async () => {
    const report = await runEvalSuite({
      model: new FlakyMockModelClient({ failureRate: 0.4, seed: 42 }),
      mode: "flaky",
      runsPerCase: 5,
    });
    expect(report.summary.unstableCases.length).toBeGreaterThan(0);
  });

  it("covers the documented golden case list", () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(10);
    const ids = GOLDEN_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every case must specify a decision/route consistent with our domain.
    for (const c of GOLDEN_CASES) {
      expect(["APPROVE", "REJECT", "ESCALATE_MANAGER", "ESCALATE_COMPLIANCE"]).toContain(
        c.expectedDecision,
      );
      expect(["auto_approve", "manager_review", "compliance_review", "reject"]).toContain(
        c.expectedRoute,
      );
    }
  });
});
