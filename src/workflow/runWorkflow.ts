import { evaluateRules, routeForDecision } from "../domain/businessRules.js";
import type { Decision, Invoice, Route } from "../domain/invoice.js";
import type { ModelClient } from "./modelClient.js";
import { TraceRecorder, type TraceEvent } from "./trace.js";

const STEP_COST = 0.0002;
const STEP_LATENCY_MS = 5;

export type WorkflowResult = {
  caseId: string;
  attempt: number;
  decision: Decision;
  route: Route;
  trace: readonly TraceEvent[];
  totalCostUnits: number;
  totalLatencyMs: number;
};

/**
 * Toy invoice-approval agentic workflow:
 *   intake → routing → review → completed
 *
 * Each step emits a trace event. Routing and review delegate to a ModelClient
 * (real or mocked). The review step also evaluates business rules locally so
 * we have a deterministic ground truth alongside the model's proposal.
 */
export async function runInvoiceWorkflow(
  caseId: string,
  attempt: number,
  invoice: Invoice,
  model: ModelClient,
): Promise<WorkflowResult> {
  const trace = new TraceRecorder();

  // ── Intake ─────────────────────────────────────────────────────────────────
  trace.emit("intake.started", "intake-agent", { caseId }, STEP_COST, STEP_LATENCY_MS);
  const missingFields: string[] = [];
  if (!invoice.vatId) missingFields.push("vatId");
  if (invoice.malformed) missingFields.push("structure");
  trace.emit(
    "intake.completed",
    "intake-agent",
    { invoiceId: invoice.invoiceId, missingFields },
    STEP_COST,
    STEP_LATENCY_MS,
  );

  // ── Routing ────────────────────────────────────────────────────────────────
  trace.emit("routing.started", "router", {}, STEP_COST, STEP_LATENCY_MS);
  const routingResp = await model.complete({
    caseId,
    task: "classify_route",
    payload: { invoice },
    attempt,
  });
  const proposedRoute: Route = routingResp.output.route ?? "manager_review";
  trace.emit(
    "routing.completed",
    "router",
    { proposedRoute },
    routingResp.costUnits,
    routingResp.latencyMs,
  );

  // ── Review ─────────────────────────────────────────────────────────────────
  trace.emit("review.started", "reviewer-agent", { proposedRoute }, STEP_COST, STEP_LATENCY_MS);

  const ruleChecks = evaluateRules(invoice);
  for (const check of ruleChecks) {
    trace.emit(
      "business_rule.checked",
      "reviewer-agent",
      { rule: check.rule, triggered: check.triggered, detail: check.detail ?? null },
      STEP_COST,
      STEP_LATENCY_MS,
    );
  }

  const reviewResp = await model.complete({
    caseId,
    task: "review_decision",
    payload: { invoice, ruleChecks },
    attempt,
  });
  const decision: Decision = reviewResp.output.decision ?? "ESCALATE_MANAGER";
  const route = routeForDecision(decision);

  trace.emit(
    "review.completed",
    "reviewer-agent",
    { decision, route },
    reviewResp.costUnits,
    reviewResp.latencyMs,
  );

  trace.emit(
    "workflow.completed",
    "orchestrator",
    { decision, route },
    STEP_COST,
    STEP_LATENCY_MS,
  );

  return {
    caseId,
    attempt,
    decision,
    route,
    trace: trace.list(),
    totalCostUnits: trace.totalCost(),
    totalLatencyMs: trace.totalLatencyMs(),
  };
}
