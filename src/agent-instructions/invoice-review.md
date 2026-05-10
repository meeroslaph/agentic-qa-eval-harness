# Invoice review — capability instructions

> Module version: `0.1.0`
> Owner: invoice domain
> Used by: review step of the invoice approval workflow

## Purpose

Make the final decision for an invoice. The reviewer evaluates each business
rule in order and emits one of four decisions:

- `APPROVE`
- `REJECT`
- `ESCALATE_MANAGER`
- `ESCALATE_COMPLIANCE`

## Rule application

Each rule is checked and emitted as a `business_rule.checked` trace event so
QA can verify the trajectory, not only the outcome.

| Rule | Triggers when |
|---|---|
| `duplicate_invoice` | `isDuplicate == true` |
| `missing_vat_id` | `vatId == null` or empty |
| `malformed_invoice` | intake flagged structural issues |
| `high_risk_vendor` | `isHighRiskVendor == true` |
| `high_amount` | `amount > 10_000` |

## Decision priority

Same as routing — reject > compliance > manager > approve. See
[invoice-routing.md](invoice-routing.md).

## Edge case: malformed/ambiguous invoices → REJECT

A malformed invoice cannot be safely escalated because the reviewer has no
reliable fields to act on. Failing closed (REJECT) is preferred to wasting a
human reviewer on incoherent data. The submitter is expected to resubmit a
valid invoice.

## Out of scope

- Communicating with the vendor
- Posting accounting entries
- Updating the duplicate ledger (handled downstream)
