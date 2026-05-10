import { describe, expect, it } from "vitest";
import {
  HIGH_AMOUNT_THRESHOLD,
  decideFromRules,
  evaluateRules,
  expectedDecision,
  routeForDecision,
} from "../src/domain/businessRules.js";
import type { Invoice } from "../src/domain/invoice.js";

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoiceId: "INV-1",
    vendorId: "V-1",
    vendorName: "Acme",
    amount: 1000,
    currency: "EUR",
    vatId: "EU123",
    submittedAt: "2026-01-01T00:00:00Z",
    isHighRiskVendor: false,
    isDuplicate: false,
    malformed: false,
    ...overrides,
  };
}

describe("businessRules", () => {
  it("approves a clean low-risk invoice", () => {
    expect(expectedDecision(baseInvoice())).toBe("APPROVE");
  });

  it("approves at the boundary amount of exactly 10,000", () => {
    expect(expectedDecision(baseInvoice({ amount: HIGH_AMOUNT_THRESHOLD }))).toBe("APPROVE");
  });

  it("escalates manager when amount exceeds threshold", () => {
    expect(expectedDecision(baseInvoice({ amount: HIGH_AMOUNT_THRESHOLD + 1 }))).toBe(
      "ESCALATE_MANAGER",
    );
  });

  it("escalates compliance for high-risk vendor regardless of amount", () => {
    expect(expectedDecision(baseInvoice({ isHighRiskVendor: true }))).toBe(
      "ESCALATE_COMPLIANCE",
    );
  });

  it("rejects on missing VAT ID", () => {
    expect(expectedDecision(baseInvoice({ vatId: null }))).toBe("REJECT");
  });

  it("rejects on duplicate invoice", () => {
    expect(expectedDecision(baseInvoice({ isDuplicate: true }))).toBe("REJECT");
  });

  it("prefers REJECT over ESCALATE_COMPLIANCE when both apply", () => {
    expect(
      expectedDecision(baseInvoice({ isDuplicate: true, isHighRiskVendor: true })),
    ).toBe("REJECT");
  });

  it("prefers ESCALATE_COMPLIANCE over ESCALATE_MANAGER", () => {
    expect(
      expectedDecision(baseInvoice({ isHighRiskVendor: true, amount: 50_000 })),
    ).toBe("ESCALATE_COMPLIANCE");
  });

  it("prefers REJECT over ESCALATE_MANAGER when both apply", () => {
    expect(expectedDecision(baseInvoice({ vatId: null, amount: 50_000 }))).toBe("REJECT");
  });

  it("rejects malformed invoices (fail closed)", () => {
    expect(expectedDecision(baseInvoice({ malformed: true }))).toBe("REJECT");
  });

  it("evaluateRules returns the canonical rule list in order", () => {
    const checks = evaluateRules(baseInvoice());
    expect(checks.map((c) => c.rule)).toEqual([
      "duplicate_invoice",
      "missing_vat_id",
      "malformed_invoice",
      "high_risk_vendor",
      "high_amount",
    ]);
  });

  it("decideFromRules works on ad-hoc trigger sets", () => {
    expect(
      decideFromRules([
        { rule: "duplicate_invoice", triggered: false },
        { rule: "missing_vat_id", triggered: false },
        { rule: "malformed_invoice", triggered: false },
        { rule: "high_risk_vendor", triggered: false },
        { rule: "high_amount", triggered: true },
      ]),
    ).toBe("ESCALATE_MANAGER");
  });

  it("routeForDecision is total over decisions", () => {
    expect(routeForDecision("APPROVE")).toBe("auto_approve");
    expect(routeForDecision("REJECT")).toBe("reject");
    expect(routeForDecision("ESCALATE_MANAGER")).toBe("manager_review");
    expect(routeForDecision("ESCALATE_COMPLIANCE")).toBe("compliance_review");
  });
});
