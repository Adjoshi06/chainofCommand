#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Command } from "commander";
import pino from "pino";

import {
  newReportId,
  policyProfileSchema,
  taskSchema,
  type PolicyProfile,
  type TaskSpec
} from "@coc/contracts";
import { ensureAgentKey } from "@coc/crypto";
import { buildSignedEvent, runProtocolFlow } from "@coc/protocol";
import { resolveCocHome, TraceLedger, TraceStore } from "@coc/store";
import { verifyTrace } from "@coc/verifier";

const logger = pino({
  level: process.env.COC_LOG_LEVEL ?? "info",
  base: undefined
});

const printErrorAndExit = (params: {
  category: string;
  message: string;
  recommended_next_command: string;
  trace_id?: string;
  code: number;
}): never => {
  const payload = {
    error_category: params.category,
    message: params.message,
    trace_id: params.trace_id,
    recommended_next_command: params.recommended_next_command
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(params.code);
};

const parseJsonFile = <T>(filePath: string): T => {
  const absolutePath = resolve(filePath);
  const raw = readFileSync(absolutePath, "utf8");
  return JSON.parse(raw) as T;
};

const renderProtocolSummary = (input: {
  trace_id: string;
  task_id: string;
  verification_status: string;
  events_emitted: number;
  report_json_path?: string;
}): string =>
  [
    "Protocol Run Complete",
    "---------------------",
    `trace_id: ${input.trace_id}`,
    `task_id: ${input.task_id}`,
    `verification_status: ${input.verification_status}`,
    `events_emitted: ${input.events_emitted}`,
    `report_json: ${input.report_json_path ?? "n/a"}`
  ].join("\n");

const renderAuditSummary = (input: {
  trace_id: string;
  verification_status: string;
  failure_count: number;
  warning_count: number;
  report_json_path?: string;
}): string =>
  [
    "Audit Verification Complete",
    "---------------------------",
    `trace_id: ${input.trace_id}`,
    `verification_status: ${input.verification_status}`,
    `failure_count: ${input.failure_count}`,
    `warning_count: ${input.warning_count}`,
    `report_json: ${input.report_json_path ?? "n/a"}`
  ].join("\n");

const appendVerificationEventsAndVerify = (params: {
  coc_home: string;
  trace_id: string;
  strict: boolean;
}): ReturnType<typeof verifyTrace> => {
  const traceStore = new TraceStore(params.coc_home);
  const ledger = new TraceLedger(params.coc_home);
  const trace = traceStore.loadTrace(params.trace_id);

  const auditor = ensureAgentKey({
    cocHome: params.coc_home,
    agentId: "auditor-agent",
    displayName: "Auditor Agent",
    roleCapabilities: ["auditor"]
  });

  const startedEvent = buildSignedEvent({
    trace_id: trace.trace_id,
    event_type: "verification_run_started",
    actor: {
      agent_id: auditor.identity.agent_id,
      role: "auditor",
      key_id: auditor.identity.key_id
    },
    payload_type: "verification_run",
    payload: {
      policy_profile: params.strict ? "strict" : trace.policy_profile
    },
    prev_event_hash: trace.head_event_hash,
    private_key_pem: auditor.private_key_pem
  });
  ledger.appendEvent(trace.trace_id, startedEvent);

  const preReport = verifyTrace({
    coc_home: params.coc_home,
    trace_id: trace.trace_id,
    policy_profile: params.strict ? "strict" : trace.policy_profile,
    write_reports: false,
    allow_incomplete_finalization: true
  });

  const reportId = newReportId();
  const refreshedTrace = traceStore.loadTrace(trace.trace_id);
  const completedEvent = buildSignedEvent({
    trace_id: trace.trace_id,
    event_type: "verification_run_completed",
    actor: {
      agent_id: auditor.identity.agent_id,
      role: "auditor",
      key_id: auditor.identity.key_id
    },
    payload_type: "verification_report",
    payload: {
      verification_status: preReport.report.verification_status,
      report_id: reportId
    },
    prev_event_hash: refreshedTrace.head_event_hash,
    private_key_pem: auditor.private_key_pem
  });
  ledger.appendEvent(trace.trace_id, completedEvent);

  const finalReport = verifyTrace({
    coc_home: params.coc_home,
    trace_id: trace.trace_id,
    policy_profile: params.strict ? "strict" : trace.policy_profile,
    report_id: reportId
  });
  traceStore.updateTraceStatus(
    trace.trace_id,
    finalReport.report.verification_status === "fail" ? "failed" : "succeeded"
  );
  return finalReport;
};

const program = new Command();
program.name("coc").description("Cryptographically accountable multi-agent protocol CLI");

const parsePolicy = (strict: boolean, value: string | undefined): PolicyProfile => {
  if (strict) {
    return "strict";
  }
  if (!value) {
    const envPolicy = process.env.COC_POLICY_PROFILE;
    return policyProfileSchema.parse(envPolicy ?? "default");
  }
  return policyProfileSchema.parse(value);
};

program
  .command("protocol")
  .description("Protocol operations")
  .command("run")
  .requiredOption("--task <task-file>", "Path to task specification JSON")
  .option("--config <config-file>", "Optional config file path")
  .option("--output <path>", "Optional output file path")
  .option("--format <text|json>", "Output format", "text")
  .option("--strict", "Use strict verifier policy profile")
  .action((options) => {
    try {
      const cocHome = resolveCocHome();
      const task = taskSchema.parse(parseJsonFile<TaskSpec>(options.task));
      const policyProfile = parsePolicy(Boolean(options.strict), options.policy_profile);
      task.policy_profile = policyProfile;
      logger.info({ trace_id: undefined, operation: "protocol.run.start" }, "starting protocol run");

      const protocolResult = runProtocolFlow({
        coc_home: cocHome,
        task
      });

      const verificationResult = appendVerificationEventsAndVerify({
        coc_home: cocHome,
        trace_id: protocolResult.trace_id,
        strict: Boolean(options.strict)
      });

      const outputPayload = {
        trace_id: protocolResult.trace_id,
        task_id: protocolResult.task_id,
        verification_status: verificationResult.report.verification_status,
        events_emitted: protocolResult.events_emitted + 2,
        report: verificationResult.report,
        report_json_path: verificationResult.report_json_path,
        report_text_path: verificationResult.report_text_path
      };

      if (options.output) {
        writeFileSync(resolve(options.output), JSON.stringify(outputPayload, null, 2), "utf8");
      }

      if (options.format === "json") {
        process.stdout.write(`${JSON.stringify(outputPayload)}\n`);
      } else {
        process.stdout.write(
          `${renderProtocolSummary({
            trace_id: protocolResult.trace_id,
            task_id: protocolResult.task_id,
            verification_status: verificationResult.report.verification_status,
            events_emitted: protocolResult.events_emitted + 2,
            report_json_path: verificationResult.report_json_path
          })}\n`
        );
      }

      process.exit(verificationResult.report.verification_status === "fail" ? 1 : 0);
    } catch (error) {
      if (error instanceof Error && /ZodError/.test(error.name)) {
        printErrorAndExit({
          category: "validation",
          message: error.message,
          recommended_next_command: "protocol run --task <task-file>",
          code: 2
        });
      }
      printErrorAndExit({
        category: "runtime",
        message: error instanceof Error ? error.message : "Unknown runtime error",
        recommended_next_command: "audit verify --trace <trace-id>",
        code: 3
      });
    }
  });

program
  .command("audit")
  .description("Audit operations")
  .command("verify")
  .requiredOption("--trace <trace-file-or-id>", "Trace ID or path")
  .option("--config <config-file>", "Optional config file path")
  .option("--output <path>", "Optional output report path")
  .option("--format <text|json>", "Output format", "text")
  .option("--strict", "Use strict policy profile")
  .action((options) => {
    try {
      const cocHome = resolveCocHome();
      const traceStore = new TraceStore(cocHome);
      const traceId = traceStore.resolveTraceId(options.trace);
      const report = verifyTrace({
        coc_home: cocHome,
        trace_id: traceId,
        policy_profile: options.strict ? "strict" : undefined
      });

      if (options.output) {
        const payload = options.format === "json" ? report.report : renderHumanOutput(report.report);
        writeFileSync(resolve(options.output), typeof payload === "string" ? payload : JSON.stringify(payload, null, 2), "utf8");
      }

      if (options.format === "json") {
        process.stdout.write(`${JSON.stringify(report.report)}\n`);
      } else {
        process.stdout.write(
          `${renderAuditSummary({
            trace_id: traceId,
            verification_status: report.report.verification_status,
            failure_count: report.report.failures.length,
            warning_count: report.report.warnings.length,
            report_json_path: report.report_json_path
          })}\n`
        );
      }

      process.exit(report.report.verification_status === "fail" ? 1 : 0);
    } catch (error) {
      if (error instanceof Error && /ZodError/.test(error.name)) {
        printErrorAndExit({
          category: "validation",
          message: error.message,
          recommended_next_command: "audit verify --trace <trace-id>",
          code: 2
        });
      }
      printErrorAndExit({
        category: "internal",
        message: error instanceof Error ? error.message : "Unknown internal error",
        recommended_next_command: "audit verify --trace <trace-id>",
        code: 4
      });
    }
  });

const renderHumanOutput = (report: { verification_status: string; failures: unknown[] }): string =>
  `verification_status: ${report.verification_status}\nfailures: ${report.failures.length}`;

program.parse(process.argv);
