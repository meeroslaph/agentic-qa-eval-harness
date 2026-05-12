import { decideFromRules, evaluateRules, routeForDecision } from "../domain/businessRules.js";
import type { Decision, Invoice, Route } from "../domain/invoice.js";
import type { ModelClient, ModelRequest, ModelResponse } from "./modelClient.js";

const MOCK_CALL_COST = 0.001;
const MOCK_CALL_LATENCY_MS = 25;

/**
 * Always answers correctly per the business rules. Used as the baseline so we
 * can verify the harness itself is correct before introducing flakiness.
 */
export class DeterministicMockModelClient implements ModelClient {
  readonly name = "DeterministicMockModelClient";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const invoice = request.payload["invoice"] as Invoice;
    const decision = decideFromRules(evaluateRules(invoice));
    const route = routeForDecision(decision);

    return {
      output:
        request.task === "classify_route" ? { route } : { decision },
      costUnits: MOCK_CALL_COST,
      latencyMs: MOCK_CALL_LATENCY_MS,
      meta: { model: this.name, deterministic: true },
    };
  }
}

/**
 * Tiny seeded pseudo-random number generator (mulberry32 by Tommy Ettinger).
 * The math doesn't matter for the harness — only the property does:
 * same seed → same number sequence, reproducibly.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ALL_ROUTES: Route[] = ["auto_approve", "manager_review", "compliance_review", "reject"];
const ALL_DECISIONS: Decision[] = [
  "APPROVE",
  "REJECT",
  "ESCALATE_MANAGER",
  "ESCALATE_COMPLIANCE",
];

export type FlakyOptions = {
  /** Probability per call that the mock returns a wrong route/decision. */
  failureRate?: number;
  /** Seed root — combined with caseId + attempt to keep runs reproducible. */
  seed?: number;
  /**
   * Per-case seed overrides. When set for a caseId, that case uses this seed
   * instead of the global one. Useful for pinning a specific instability
   * pattern as a regression test, independent of the global seed.
   */
  caseSeeds?: Readonly<Record<string, number>>;
  /**
   * Per-case failure-rate overrides. Use 1 to force a case to always flake
   * (hard-fail regression) or 0 to keep one case clean while others flake.
   * Falls back to the global failureRate when not set.
   */
  caseFailureRates?: Readonly<Record<string, number>>;
};

/**
 * Simulates a non-deterministic agent. Most calls are correct; occasionally
 * (per failureRate) the model returns a different route/decision. The choice
 * is fully reproducible given (seed, caseId, attempt), so flaky-mode reports
 * are stable enough to commit.
 */
export class FlakyMockModelClient implements ModelClient {
  readonly name = "FlakyMockModelClient";
  private readonly failureRate: number;
  private readonly seed: number;
  private readonly caseSeeds: Readonly<Record<string, number>>;
  private readonly caseFailureRates: Readonly<Record<string, number>>;

  constructor(opts: FlakyOptions = {}) {
    this.failureRate = opts.failureRate ?? 0.25;
    this.seed = opts.seed ?? 42;
    this.caseSeeds = opts.caseSeeds ?? {};
    this.caseFailureRates = opts.caseFailureRates ?? {};
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const invoice = request.payload["invoice"] as Invoice;
    const correctDecision = decideFromRules(evaluateRules(invoice));
    const correctRoute = routeForDecision(correctDecision);

    const effectiveSeed = this.caseSeeds[request.caseId] ?? this.seed;
    const effectiveRate = this.caseFailureRates[request.caseId] ?? this.failureRate;

    const rngSeed =
      effectiveSeed ^
      hashString(`${request.caseId}|${request.task}|${request.attempt}`);
    const rng = mulberry32(rngSeed);

    const flake = rng() < effectiveRate;

    let route = correctRoute;
    let decision = correctDecision;

    if (flake) {
      if (request.task === "classify_route") {
        const alternatives = ALL_ROUTES.filter((r) => r !== correctRoute);
        const idx = Math.floor(rng() * alternatives.length);
        route = alternatives[idx] ?? correctRoute;
      } else {
        const alternatives = ALL_DECISIONS.filter((d) => d !== correctDecision);
        const idx = Math.floor(rng() * alternatives.length);
        decision = alternatives[idx] ?? correctDecision;
      }
    }

    return {
      output:
        request.task === "classify_route" ? { route } : { decision },
      costUnits: MOCK_CALL_COST,
      // Add a small jitter so latency p95 has shape in reports.
      latencyMs: MOCK_CALL_LATENCY_MS + Math.floor(rng() * 30),
      meta: { model: this.name, deterministic: false },
    };
  }
}
