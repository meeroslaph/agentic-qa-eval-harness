import { describe, expect, it } from "vitest";
import {
  DeterministicMockModelClient,
  FlakyMockModelClient,
} from "../src/workflow/mockModelClient.js";
import type { Invoice } from "../src/domain/invoice.js";
import type { ModelClient } from "../src/workflow/modelClient.js";

const invoice: Invoice = {
  invoiceId: "INV-MC",
  vendorId: "V-MC",
  vendorName: "Mock Co",
  amount: 9_500,
  currency: "EUR",
  vatId: "EU111",
  submittedAt: "2026-01-01T00:00:00Z",
  isHighRiskVendor: false,
  isDuplicate: false,
  malformed: false,
};

describe("ModelClient abstraction", () => {
  it("both mocks satisfy the ModelClient contract", async () => {
    const clients: ModelClient[] = [
      new DeterministicMockModelClient(),
      new FlakyMockModelClient({ failureRate: 0, seed: 1 }),
    ];
    for (const c of clients) {
      const resp = await c.complete({
        caseId: "x",
        task: "classify_route",
        payload: { invoice },
        attempt: 1,
      });
      expect(resp.costUnits).toBeGreaterThan(0);
      expect(resp.latencyMs).toBeGreaterThan(0);
      expect(resp.meta.model).toBe(c.name);
      expect(resp.output.route).toBeDefined();
    }
  });

  it("FlakyMockModelClient with failureRate=0 always agrees with deterministic mock", async () => {
    const det = new DeterministicMockModelClient();
    const flaky = new FlakyMockModelClient({ failureRate: 0, seed: 99 });
    for (let attempt = 1; attempt <= 5; attempt++) {
      const a = await det.complete({
        caseId: "c",
        task: "review_decision",
        payload: { invoice },
        attempt,
      });
      const b = await flaky.complete({
        caseId: "c",
        task: "review_decision",
        payload: { invoice },
        attempt,
      });
      expect(b.output.decision).toBe(a.output.decision);
    }
  });

  it("per-case failureRate override forces a single case to always flake", async () => {
    // Global rate 0 (everything stable) except gc-pinned which is forced to 1
    // (every call wrong). Lets goldens pin a known instability as a regression.
    const flaky = new FlakyMockModelClient({
      failureRate: 0,
      seed: 7,
      caseFailureRates: { "gc-pinned": 1 },
    });

    const stable = await flaky.complete({
      caseId: "gc-other",
      task: "review_decision",
      payload: { invoice },
      attempt: 1,
    });
    expect(stable.output.decision).toBe("APPROVE");

    for (let attempt = 1; attempt <= 5; attempt++) {
      const r = await flaky.complete({
        caseId: "gc-pinned",
        task: "review_decision",
        payload: { invoice },
        attempt,
      });
      expect(r.output.decision).not.toBe("APPROVE");
    }
  });

  it("per-case seed override changes the flake pattern for that case only", async () => {
    const a = new FlakyMockModelClient({ failureRate: 1, seed: 1 });
    const b = new FlakyMockModelClient({
      failureRate: 1,
      seed: 1,
      caseSeeds: { "gc-pinned": 12345 },
    });

    // Same seed -> same wrong-decision picked for an unaffected case.
    const ra = await a.complete({
      caseId: "gc-other",
      task: "review_decision",
      payload: { invoice },
      attempt: 1,
    });
    const rb = await b.complete({
      caseId: "gc-other",
      task: "review_decision",
      payload: { invoice },
      attempt: 1,
    });
    expect(rb.output.decision).toBe(ra.output.decision);

    // For the pinned case, the stream diverges from the global-seed one.
    // Sample a handful of attempts; at least one must differ.
    let saw = false;
    for (let attempt = 1; attempt <= 10 && !saw; attempt++) {
      const ga = await a.complete({
        caseId: "gc-pinned",
        task: "review_decision",
        payload: { invoice },
        attempt,
      });
      const gb = await b.complete({
        caseId: "gc-pinned",
        task: "review_decision",
        payload: { invoice },
        attempt,
      });
      if (ga.output.decision !== gb.output.decision) saw = true;
    }
    expect(saw).toBe(true);
  });

  it("per-case seed override is reproducible across instances", async () => {
    const opts = {
      failureRate: 1,
      seed: 99,
      caseSeeds: { "gc-pinned": 4242 },
    };
    const a = new FlakyMockModelClient(opts);
    const b = new FlakyMockModelClient(opts);
    const req = {
      caseId: "gc-pinned",
      task: "review_decision" as const,
      payload: { invoice },
      attempt: 3,
    };
    const ra = await a.complete(req);
    const rb = await b.complete(req);
    expect(rb.output.decision).toBe(ra.output.decision);
  });
});
