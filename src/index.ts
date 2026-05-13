import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DeterministicMockModelClient,
  FlakyMockModelClient,
} from "./workflow/mockModelClient.js";
import { runEvalSuite } from "./eval/runEvalSuite.js";
import { renderMarkdownReport } from "./eval/report.js";

type CliArgs = {
  mode: "deterministic" | "flaky";
  runs: number;
  out: string;
  failureRate: number;
  seed: number;
};

function parseArgs(argv: readonly string[]): CliArgs {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    args[m[1]!] = m[2] ?? "true";
  }
  const mode = (args["mode"] ?? "deterministic") as CliArgs["mode"];
  if (mode !== "deterministic" && mode !== "flaky") {
    throw new Error(`Unknown --mode=${mode}. Use deterministic|flaky.`);
  }
  return {
    mode,
    runs: Number(args["runs"] ?? 5),
    out: args["out"] ?? `reports/${mode}-report.md`,
    failureRate: Number(args["failure-rate"] ?? 0.25),
    seed: Number(args["seed"] ?? 42),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const model =
    args.mode === "deterministic"
      ? new DeterministicMockModelClient()
      : new FlakyMockModelClient({ failureRate: args.failureRate, seed: args.seed });

  const report = await runEvalSuite({
    model,
    mode: args.mode,
    runsPerCase: args.runs,
    ...(args.mode === "flaky"
      ? { flakyConfig: { seed: args.seed, failureRate: args.failureRate } }
      : {}),
  });

  const md = renderMarkdownReport(report);
  const outPath = resolve(process.cwd(), args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, md, "utf8");

  printConsoleSummary(report, outPath);
}

function printConsoleSummary(
  report: Awaited<ReturnType<typeof runEvalSuite>>,
  outPath: string,
): void {
  const s = report.summary;
  /* eslint-disable no-console */
  console.log(`\n=== Eval suite: ${report.mode} (${report.modelName}) ===`);
  console.log(
    `cases=${s.totalCases} runs=${s.totalRuns} runs/case=${report.runsPerCase}`,
  );
  console.log(`outcome_pass_rate     : ${(s.outcomePassRate * 100).toFixed(2)}%`);
  console.log(`trajectory_pass_rate  : ${(s.trajectoryPassRate * 100).toFixed(2)}%`);
  console.log(`consistency_rate      : ${(s.consistencyRate * 100).toFixed(2)}%`);
  console.log(`escalation_accuracy   : ${(s.escalation.accuracy * 100).toFixed(2)}%`);
  console.log(
    `avg cost units / p95 latency ms: ${s.costLatency.averageCostUnits} / ${s.costLatency.p95LatencyMs}`,
  );
  if (s.failedCases.length > 0) console.log(`failed cases  : ${s.failedCases.join(", ")}`);
  if (s.unstableCases.length > 0) console.log(`unstable cases: ${s.unstableCases.join(", ")}`);
  console.log(`report -> ${outPath}\n`);
  /* eslint-enable no-console */
}

main().catch((err) => {
  /* eslint-disable-next-line no-console */
  console.error(err);
  process.exit(1);
});
