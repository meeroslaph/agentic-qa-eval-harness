# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Copilot, etc.) working on
this repo.

## Project purpose

This is a proof-of-concept for a QA and evaluation harness around an agentic
workflow. The toy domain is invoice approval. The harness is the point; the
agent itself is intentionally minimal and mocked.

When in doubt, optimize for clarity over cleverness.

## Commands

```bash
npm install
npm test           # vitest
npm run typecheck  # strict TS, no emit
npm run build      # emit to dist/
npm run eval       # deterministic baseline → reports/baseline-report.md
npm run eval:flaky # flaky mock           → reports/flaky-report.md
```

The two reports are committed as samples and should remain stable run-over-run.

## Coding standards

- TypeScript strict mode. No `any` unless argued for in a comment.
- Small, explicit domain types. Prefer named types over inline anonymous
  shapes for cross-module boundaries.
- Functions should be short and obvious. If a function needs a paragraph of
  comments to explain it, simplify the function.
- Use `zod` only at trust boundaries (e.g. validating an external invoice
  payload). Don't use it for internal types we control.
- Comments only where intent is non-obvious: why, not what.

## Testing expectations

- Every business rule is covered by a unit test, including priority cases
  (reject vs compliance vs manager).
- Every evaluator has a passing-case test and a failing-case test.
- The flaky mock has a reproducibility test (same seed → same output) and
  an instability test (high failure rate → multiple decisions seen).
- Integration test runs `runEvalSuite` end-to-end in both modes.

## Constraints: what NOT to add

- **No real paid LLM API calls.** Anthropic, OpenAI, etc. The repo must run
  in CI with no secrets.
- **No LangChain, no LangGraph, no agent framework**. The PoC is meant to
  show first-principles design.
- **No SaaS tracing**, no database, no server, no UI.
- **No Claude Skills**, no proprietary agent runtime.
- Don't introduce dependencies casually. Every new dependency should earn its place.
- Don't expand the toy domain. The simplicity comes from the whole codebase
  fitting in one head.

## Preserve the core message

This repo demonstrates a **QA / evaluation harness** for agentic systems:

- model/provider abstraction and mock layer
- golden datasets
- outcome + trajectory + consistency evaluation
- escalation precision / recall
- cost / latency simulation
- traceability
- modular markdown agent instructions

If a change does not serve one of those concerns, push back on it.
