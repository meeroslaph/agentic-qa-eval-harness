import { describe, expect, it } from "vitest";
import {
  DeterministicMockModelClient,
  FlakyMockModelClient,
} from "../src/workflow/mockModelClient.js";
import { runInvoiceWorkflow } from "../src/workflow/runWorkflow.js";
import type { Invoice } from "../src/domain/invoice.js";

const cleanInvoice: Invoice = {
  invoiceId: "INV-T1",
  vendorId: "V-T",
  vendorName: "Test Vendor",
  amount: 500,
  currency: "EUR",
  vatId: "EU000",
  submittedAt: "2026-01-01T00:00:00Z",
  isHighRiskVendor: false,
  isDuplicate: false,
  malformed: false,
};

describe("runInvoiceWorkflow with DeterministicMockModelClient", () => {
  it("approves a clean invoice and emits the canonical trace sequence", async () => {
    const result = await runInvoiceWorkflow(
      "case-clean",
      1,
      cleanInvoice,
      new DeterministicMockModelClient(),
    );

    expect(result.decision).toBe("APPROVE");
    expect(result.route).toBe("auto_approve");

    const eventNames: string[] = result.trace.map((e) => e.name);
    const required: string[] = [
      "intake.started",
      "intake.completed",
      "routing.started",
      "routing.completed",
      "review.started",
      "business_rule.checked",
      "review.completed",
      "workflow.completed",
    ];
    let cursor = 0;
    for (const r of required) {
      const idx = eventNames.indexOf(r, cursor);
      expect(idx, `missing ${r}`).toBeGreaterThanOrEqual(0);
      cursor = idx + 1;
    }
  });

  it("escalates to compliance for a high-risk vendor", async () => {
    const result = await runInvoiceWorkflow(
      "case-risk",
      1,
      { ...cleanInvoice, isHighRiskVendor: true },
      new DeterministicMockModelClient(),
    );
    expect(result.decision).toBe("ESCALATE_COMPLIANCE");
    expect(result.route).toBe("compliance_review");
  });

  it("rejects a duplicate invoice", async () => {
    const result = await runInvoiceWorkflow(
      "case-dup",
      1,
      { ...cleanInvoice, isDuplicate: true },
      new DeterministicMockModelClient(),
    );
    expect(result.decision).toBe("REJECT");
    expect(result.route).toBe("reject");
  });

  it("accumulates non-zero simulated cost and latency", async () => {
    const result = await runInvoiceWorkflow(
      "case-cost",
      1,
      cleanInvoice,
      new DeterministicMockModelClient(),
    );
    expect(result.totalCostUnits).toBeGreaterThan(0);
    expect(result.totalLatencyMs).toBeGreaterThan(0);
  });
});

describe("FlakyMockModelClient", () => {
  it("is reproducible: same seed/case/attempt → same decision", async () => {
    const a = new FlakyMockModelClient({ failureRate: 0.5, seed: 7 });
    const b = new FlakyMockModelClient({ failureRate: 0.5, seed: 7 });

    const r1 = await runInvoiceWorkflow("case-X", 3, cleanInvoice, a);
    const r2 = await runInvoiceWorkflow("case-X", 3, cleanInvoice, b);

    expect(r1.decision).toBe(r2.decision);
    expect(r1.route).toBe(r2.route);
  });

  it("can produce inconsistency across attempts at high failure rate", async () => {
    const flaky = new FlakyMockModelClient({ failureRate: 0.8, seed: 1 });
    const decisions = new Set<string>();
    for (let attempt = 1; attempt <= 10; attempt++) {
      const r = await runInvoiceWorkflow("case-instability", attempt, cleanInvoice, flaky);
      decisions.add(r.decision);
    }
    // We expect at least 2 distinct decisions across 10 attempts at 80% flake rate.
    expect(decisions.size).toBeGreaterThan(1);
  });
});
