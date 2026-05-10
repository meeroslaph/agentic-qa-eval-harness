import { z } from "zod";

export const InvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  vendorId: z.string().min(1),
  vendorName: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
  vatId: z.string().min(1).nullable(),
  submittedAt: z.string().min(1),
  isHighRiskVendor: z.boolean(),
  isDuplicate: z.boolean(),
  malformed: z.boolean().optional(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export type Decision =
  | "APPROVE"
  | "REJECT"
  | "ESCALATE_MANAGER"
  | "ESCALATE_COMPLIANCE";

export type Route =
  | "auto_approve"
  | "manager_review"
  | "compliance_review"
  | "reject";

export const ESCALATION_DECISIONS: ReadonlySet<Decision> = new Set([
  "ESCALATE_MANAGER",
  "ESCALATE_COMPLIANCE",
]);
