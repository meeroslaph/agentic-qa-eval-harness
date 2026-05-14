import type { Decision, Invoice, Route } from "./invoice.js";

export const HIGH_AMOUNT_THRESHOLD = 10_000;

export type RuleCheck = {
  rule: string;
  triggered: boolean;
  detail?: string;
};

/**
 * Returns the canonical rule checks in the order they are evaluated.
 * Used both by the workflow review step and by trajectory evaluation.
 */
export function evaluateRules(invoice: Invoice): RuleCheck[] {
  return [
    {
      rule: "duplicate_invoice",
      triggered: invoice.isDuplicate,
      detail: invoice.isDuplicate ? `duplicate ${invoice.invoiceId}` : undefined,
    },
    {
      rule: "missing_vat_id",
      triggered: invoice.vatId === null || invoice.vatId === "",
    },
    {
      rule: "malformed_invoice",
      triggered: invoice.malformed === true,
    },
    {
      rule: "high_risk_vendor",
      triggered: invoice.isHighRiskVendor,
    },
    {
      rule: "high_amount",
      triggered: invoice.amount > HIGH_AMOUNT_THRESHOLD,
      detail: `amount=${invoice.amount}`,
    },
  ];
}

/**
 * Decision priority (highest first):
 *   1. REJECT: duplicate, missing VAT, or malformed
 *   2. ESCALATE_COMPLIANCE: high-risk vendor
 *   3. ESCALATE_MANAGER: amount strictly above threshold
 *   4. APPROVE: everything else (including amount == threshold)
 */
export function decideFromRules(checks: readonly RuleCheck[]): Decision {
  const triggered = new Set(checks.filter((c) => c.triggered).map((c) => c.rule));

  if (
    triggered.has("duplicate_invoice") ||
    triggered.has("missing_vat_id") ||
    triggered.has("malformed_invoice")
  ) {
    return "REJECT";
  }
  if (triggered.has("high_risk_vendor")) return "ESCALATE_COMPLIANCE";
  if (triggered.has("high_amount")) return "ESCALATE_MANAGER";
  return "APPROVE";
}

export function routeForDecision(decision: Decision): Route {
  switch (decision) {
    case "APPROVE":
      return "auto_approve";
    case "REJECT":
      return "reject";
    case "ESCALATE_MANAGER":
      return "manager_review";
    case "ESCALATE_COMPLIANCE":
      return "compliance_review";
  }
}

export function expectedDecision(invoice: Invoice): Decision {
  return decideFromRules(evaluateRules(invoice));
}
