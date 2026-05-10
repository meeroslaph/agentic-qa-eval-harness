import type { Decision, Invoice, Route } from "../domain/invoice.js";
import type { TraceEventName } from "../workflow/trace.js";

export type RiskTag =
  | "boundary"
  | "compliance"
  | "negative"
  | "high_value"
  | "happy_path"
  | "edge_case";

export type GoldenCase = {
  id: string;
  description: string;
  invoice: Invoice;
  expectedDecision: Decision;
  expectedRoute: Route;
  /**
   * Trajectory expectation: required event names that must appear *in order*.
   * Other events may appear between them.
   */
  expectedTrajectory: readonly TraceEventName[];
  riskTags: readonly RiskTag[];
  notes?: string;
};

const BASE_TRAJECTORY: readonly TraceEventName[] = [
  "intake.started",
  "intake.completed",
  "routing.started",
  "routing.completed",
  "review.started",
  "review.completed",
  "workflow.completed",
];

function inv(partial: Partial<Invoice> & Pick<Invoice, "invoiceId" | "vendorId" | "amount">): Invoice {
  return {
    vendorName: "Acme Trading Ltd",
    currency: "EUR",
    submittedAt: "2026-01-15T10:00:00Z",
    vatId: "EU123456789",
    isHighRiskVendor: false,
    isDuplicate: false,
    malformed: false,
    ...partial,
  };
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    id: "gc-001-low-risk-approve",
    description: "Valid low-risk invoice well under threshold should auto-approve.",
    invoice: inv({ invoiceId: "INV-1001", vendorId: "V-100", amount: 1_500 }),
    expectedDecision: "APPROVE",
    expectedRoute: "auto_approve",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["happy_path"],
  },
  {
    id: "gc-002-high-amount-manager",
    description: "Amount strictly above 10,000 must escalate to manager.",
    invoice: inv({ invoiceId: "INV-1002", vendorId: "V-100", amount: 12_500 }),
    expectedDecision: "ESCALATE_MANAGER",
    expectedRoute: "manager_review",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["high_value"],
  },
  {
    id: "gc-003-high-risk-vendor-compliance",
    description: "High-risk vendor must escalate to compliance regardless of amount.",
    invoice: inv({
      invoiceId: "INV-1003",
      vendorId: "V-RISK-1",
      amount: 800,
      isHighRiskVendor: true,
    }),
    expectedDecision: "ESCALATE_COMPLIANCE",
    expectedRoute: "compliance_review",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["compliance"],
  },
  {
    id: "gc-004-missing-vat-reject",
    description: "Missing VAT ID is a hard reject.",
    invoice: inv({ invoiceId: "INV-1004", vendorId: "V-100", amount: 2_000, vatId: null }),
    expectedDecision: "REJECT",
    expectedRoute: "reject",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["negative"],
  },
  {
    id: "gc-005-duplicate-reject",
    description: "Duplicate invoice number is a hard reject.",
    invoice: inv({
      invoiceId: "INV-1005",
      vendorId: "V-100",
      amount: 3_000,
      isDuplicate: true,
    }),
    expectedDecision: "REJECT",
    expectedRoute: "reject",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["negative"],
  },
  {
    id: "gc-006-high-amount-and-high-risk",
    description: "High amount + high-risk vendor → compliance wins over manager.",
    invoice: inv({
      invoiceId: "INV-1006",
      vendorId: "V-RISK-2",
      amount: 50_000,
      isHighRiskVendor: true,
    }),
    expectedDecision: "ESCALATE_COMPLIANCE",
    expectedRoute: "compliance_review",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["compliance", "high_value"],
  },
  {
    id: "gc-007-high-amount-missing-vat-reject",
    description: "High amount + missing VAT → reject wins (rejection priority).",
    invoice: inv({
      invoiceId: "INV-1007",
      vendorId: "V-100",
      amount: 25_000,
      vatId: null,
    }),
    expectedDecision: "REJECT",
    expectedRoute: "reject",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["negative", "high_value"],
  },
  {
    id: "gc-008-duplicate-and-high-risk-reject",
    description: "Duplicate + high-risk → reject wins over compliance.",
    invoice: inv({
      invoiceId: "INV-1008",
      vendorId: "V-RISK-3",
      amount: 4_000,
      isDuplicate: true,
      isHighRiskVendor: true,
    }),
    expectedDecision: "REJECT",
    expectedRoute: "reject",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["negative", "compliance"],
  },
  {
    id: "gc-009-boundary-exactly-10000-approve",
    description: "Boundary: amount exactly 10,000 is NOT high-amount, so approve.",
    invoice: inv({ invoiceId: "INV-1009", vendorId: "V-100", amount: 10_000 }),
    expectedDecision: "APPROVE",
    expectedRoute: "auto_approve",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["boundary"],
  },
  {
    id: "gc-010-malformed-reject",
    description:
      "Malformed/ambiguous invoice → REJECT. Rationale: an agent that cannot parse " +
      "fields should fail closed rather than escalate, to avoid wasting human reviewer time.",
    invoice: inv({
      invoiceId: "INV-1010",
      vendorId: "V-???",
      amount: 0,
      vatId: null,
      malformed: true,
    }),
    expectedDecision: "REJECT",
    expectedRoute: "reject",
    expectedTrajectory: BASE_TRAJECTORY,
    riskTags: ["edge_case", "negative"],
    notes: "Fail-closed policy chosen over compliance escalation; documented in agent-instructions/invoice-review.md.",
  },
];
