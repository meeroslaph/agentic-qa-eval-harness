export type TraceEventName =
  | "intake.started"
  | "intake.completed"
  | "routing.started"
  | "routing.completed"
  | "review.started"
  | "business_rule.checked"
  | "review.completed"
  | "workflow.completed";

export type TraceEvent = {
  ts: number;
  name: TraceEventName;
  component: string;
  metadata: Record<string, unknown>;
  costUnits: number;
  latencyMs: number;
};

/**
 * Simple in-memory trace recorder. Costs/latencies are simulated, not measured —
 * see costEvaluator for the constants.
 */
export class TraceRecorder {
  private events: TraceEvent[] = [];
  private clock: number;

  constructor(startTs = 0) {
    this.clock = startTs;
  }

  emit(
    name: TraceEventName,
    component: string,
    metadata: Record<string, unknown> = {},
    costUnits = 0,
    latencyMs = 0,
  ): void {
    this.clock += latencyMs;
    this.events.push({
      ts: this.clock,
      name,
      component,
      metadata,
      costUnits,
      latencyMs,
    });
  }

  list(): readonly TraceEvent[] {
    return this.events;
  }

  totalCost(): number {
    return this.events.reduce((sum, e) => sum + e.costUnits, 0);
  }

  totalLatencyMs(): number {
    return this.events.reduce((sum, e) => sum + e.latencyMs, 0);
  }
}
