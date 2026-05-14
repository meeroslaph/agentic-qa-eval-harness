# Invoice routing: capability instructions

> Module version: `0.1.0`
> Owner: invoice domain
> Used by: routing step of the invoice approval workflow

## Purpose

Pick the route an invoice should follow. The router classifies, it does not
finalize the decision. The reviewer agent has the last word and can override
based on business rules.

## Routes

- `auto_approve`: clean, low-risk, under or equal to threshold
- `manager_review`: high amount with no other blocking issues
- `compliance_review`: high-risk vendor or other compliance signal
- `reject`: duplicate, missing VAT, or malformed

## Priority (highest first)

1. Reject: `isDuplicate` OR `vatId == null` OR `malformed`
2. Compliance: `isHighRiskVendor`
3. Manager: `amount > 10_000`
4. Auto-approve: otherwise

## Rationale

- Rejects always win because forwarding bad inputs wastes reviewer time and
  creates audit noise.
- Compliance wins over manager because compliance reviewers can also approve
  for amount, but managers cannot waive a compliance flag.
- The amount comparison is **strictly greater than** 10,000. Boundary
  amount of exactly 10,000 routes to auto-approve.
