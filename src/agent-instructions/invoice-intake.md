# Invoice intake: capability instructions

> Module version: `0.1.0`
> Owner: invoice domain
> Used by: intake step of the invoice approval workflow

## Purpose

Convert a raw invoice payload into a normalized `Invoice` record and flag any
fields that are missing, ambiguous, or structurally malformed. The intake
step does not make approval decisions; it produces clean inputs for routing
and review.

## Required output fields

| Field | Notes |
| --- | --- |
| `invoiceId` | string, non-empty |
| `vendorId` | string, non-empty |
| `vendorName` | string |
| `amount` | non-negative number |
| `currency` | ISO 4217 code |
| `vatId` | string OR `null` if absent |
| `submittedAt` | ISO-8601 timestamp |
| `isHighRiskVendor` | boolean (from vendor risk register) |
| `isDuplicate` | boolean (from invoice ledger lookup) |

## Missing-data signals

When a required field is missing, surface it in the trace metadata under
`missingFields` rather than silently defaulting. Common cases:

- VAT ID absent → flag `"vatId"`
- Unparseable structure → flag `"structure"` and set `malformed = true`

## Out of scope

- Decision-making
- Routing
- External vendor lookups beyond the risk register
