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
});
