import type { Decision, Route } from "../domain/invoice.js";

/**
 * The boundary between the deterministic harness and any (current or future)
 * non-deterministic model backend. Today only mocks implement this interface.
 * A real OpenAI/Anthropic/Ollama adapter would slot in unchanged.
 */
export interface ModelClient {
  readonly name: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export type ModelTask = "classify_route" | "review_decision";

export type ModelRequest = {
  caseId: string;
  task: ModelTask;
  /** Free-form payload, kept loose to avoid coupling to a real schema. */
  payload: Record<string, unknown>;
  /** Per-call attempt index, used by mocks to vary behavior across repeated runs. */
  attempt: number;
};

export type ModelResponse = {
  /** Always present. The mock model proposes a route or a decision. */
  output: { route?: Route; decision?: Decision };
  /** Simulated cost per call, so the harness can report cost without a real provider. */
  costUnits: number;
  /** Simulated latency in ms, added to the trace clock. */
  latencyMs: number;
  /** Useful for debugging and report inspection. */
  meta: { model: string; deterministic: boolean };
};
