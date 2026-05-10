import type { WorkflowResult } from "../workflow/runWorkflow.js";

export type CostLatencyAggregate = {
  totalRuns: number;
  totalCostUnits: number;
  averageCostUnits: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
};

export function aggregateCostLatency(runs: readonly WorkflowResult[]): CostLatencyAggregate {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      totalCostUnits: 0,
      averageCostUnits: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
    };
  }
  const totalCost = runs.reduce((s, r) => s + r.totalCostUnits, 0);
  const totalLatency = runs.reduce((s, r) => s + r.totalLatencyMs, 0);
  const sortedLatencies = runs.map((r) => r.totalLatencyMs).sort((a, b) => a - b);
  const p95Index = Math.min(
    sortedLatencies.length - 1,
    Math.ceil(0.95 * sortedLatencies.length) - 1,
  );
  return {
    totalRuns: runs.length,
    totalCostUnits: round(totalCost, 6),
    averageCostUnits: round(totalCost / runs.length, 6),
    averageLatencyMs: round(totalLatency / runs.length, 2),
    p95LatencyMs: sortedLatencies[Math.max(0, p95Index)] ?? 0,
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
