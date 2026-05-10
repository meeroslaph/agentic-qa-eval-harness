import type { ModelClient } from "../workflow/modelClient.js";
import { runInvoiceWorkflow, type WorkflowResult } from "../workflow/runWorkflow.js";
import { aggregateCostLatency, type CostLatencyAggregate } from "./costEvaluator.js";
import { evaluateConsistency, type ConsistencyResult } from "./consistencyEvaluator.js";
import { evaluateEscalations, type EscalationMetrics } from "./escalationEvaluator.js";
import { evaluateOutcome, type OutcomeResult } from "./outcomeEvaluator.js";
import { evaluateTrajectory, type TrajectoryResult } from "./trajectoryEvaluator.js";
import { GOLDEN_CASES, type GoldenCase } from "./goldenCases.js";

export type CaseEvalReport = {
  goldenCase: GoldenCase;
  runs: readonly WorkflowResult[];
  outcomes: readonly OutcomeResult[];
  trajectories: readonly TrajectoryResult[];
  consistency: ConsistencyResult;
};

export type FlakyConfig = {
  seed: number;
  failureRate: number;
};

export type SuiteReport = {
  modelName: string;
  mode: "deterministic" | "flaky";
  runsPerCase: number;
  flakyConfig?: FlakyConfig;
  cases: readonly CaseEvalReport[];
  summary: {
    totalCases: number;
    totalRuns: number;
    outcomePassRate: number;
    trajectoryPassRate: number;
    consistencyRate: number;
    failedCases: readonly string[];
    unstableCases: readonly string[];
    escalation: EscalationMetrics;
    costLatency: CostLatencyAggregate;
  };
};

export type RunEvalOptions = {
  model: ModelClient;
  mode: "deterministic" | "flaky";
  runsPerCase?: number;
  cases?: readonly GoldenCase[];
  flakyConfig?: FlakyConfig;
};

export async function runEvalSuite(opts: RunEvalOptions): Promise<SuiteReport> {
  const runsPerCase = opts.runsPerCase ?? 5;
  const cases = opts.cases ?? GOLDEN_CASES;

  const caseReports: CaseEvalReport[] = [];
  const allRuns: WorkflowResult[] = [];
  const escalationPairs: { goldenCase: GoldenCase; run: WorkflowResult }[] = [];

  for (const c of cases) {
    const runs: WorkflowResult[] = [];
    const outcomes: OutcomeResult[] = [];
    const trajectories: TrajectoryResult[] = [];

    for (let attempt = 1; attempt <= runsPerCase; attempt++) {
      const run = await runInvoiceWorkflow(c.id, attempt, c.invoice, opts.model);
      runs.push(run);
      outcomes.push(evaluateOutcome(c, run));
      trajectories.push(evaluateTrajectory(c, run));
      escalationPairs.push({ goldenCase: c, run });
      allRuns.push(run);
    }

    caseReports.push({
      goldenCase: c,
      runs,
      outcomes,
      trajectories,
      consistency: evaluateConsistency(c.id, runs),
    });
  }

  const totalRuns = allRuns.length;
  const outcomePasses = caseReports.flatMap((c) => c.outcomes).filter((o) => o.passed).length;
  const trajectoryPasses = caseReports
    .flatMap((c) => c.trajectories)
    .filter((t) => t.passed).length;

  const failedCases = caseReports
    .filter((c) => c.outcomes.some((o) => !o.passed))
    .map((c) => c.goldenCase.id);
  const unstableCases = caseReports
    .filter((c) => !c.consistency.consistent)
    .map((c) => c.goldenCase.id);

  return {
    modelName: opts.model.name,
    mode: opts.mode,
    runsPerCase,
    ...(opts.flakyConfig ? { flakyConfig: opts.flakyConfig } : {}),
    cases: caseReports,
    summary: {
      totalCases: cases.length,
      totalRuns,
      outcomePassRate: ratio(outcomePasses, totalRuns),
      trajectoryPassRate: ratio(trajectoryPasses, totalRuns),
      consistencyRate: ratio(
        caseReports.filter((c) => c.consistency.consistent).length,
        caseReports.length,
      ),
      failedCases,
      unstableCases,
      escalation: evaluateEscalations(escalationPairs),
      costLatency: aggregateCostLatency(allRuns),
    },
  };
}

function ratio(n: number, d: number): number {
  if (d === 0) return 1;
  return Math.round((n / d) * 10000) / 10000;
}
