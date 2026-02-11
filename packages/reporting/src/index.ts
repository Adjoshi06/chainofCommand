import { type VerificationReport } from "@coc/contracts";

const severityRank: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export const renderHumanReport = (report: VerificationReport): string => {
  const lines: string[] = [];
  lines.push("Cryptographic Trace Verification Report");
  lines.push("======================================");
  lines.push(`Trace ID: ${report.trace_id}`);
  lines.push(`Report ID: ${report.report_id}`);
  lines.push(`Schema Version: ${report.schema_version}`);
  lines.push(`Verified At: ${report.verified_at}`);
  lines.push(`Policy Profile: ${report.policy_profile}`);
  lines.push(`Verdict: ${report.verification_status}`);
  lines.push("");
  lines.push("Summary");
  lines.push("-------");
  lines.push(report.summary);
  lines.push("");

  const sortedFailures = [...report.failures].sort(
    (left, right) => severityRank[left.severity] - severityRank[right.severity]
  );

  lines.push("Findings");
  lines.push("--------");
  if (sortedFailures.length === 0) {
    lines.push("No failures detected.");
  } else {
    for (const failure of sortedFailures) {
      lines.push(
        `- [${failure.severity.toUpperCase()}] ${failure.failure_code} at step ${
          failure.verification_step
        }`
      );
      lines.push(`  message: ${failure.message}`);
      if (failure.event_id) {
        lines.push(`  event_id: ${failure.event_id}`);
      }
      if (failure.artifact_hash) {
        lines.push(`  artifact_hash: ${failure.artifact_hash}`);
      }
      lines.push(`  remediation: ${failure.recommended_remediation}`);
    }
  }
  lines.push("");

  lines.push("Warnings");
  lines.push("--------");
  if (report.warnings.length === 0) {
    lines.push("No warnings.");
  } else {
    for (const warning of report.warnings) {
      lines.push(`- [${warning.severity}] ${warning.warning_code}: ${warning.message}`);
    }
  }
  lines.push("");

  lines.push("Checks");
  lines.push("------");
  for (const check of report.checks) {
    lines.push(`- ${check.check_id}: ${check.status} (${check.elapsed_ms.toFixed(2)} ms)`);
  }
  lines.push("");

  lines.push("Recommended Next Actions");
  lines.push("------------------------");
  if (report.failures.length === 0) {
    lines.push("No remediation required.");
  } else {
    const actions = Array.from(new Set(report.failures.map((failure) => failure.suggested_action)));
    for (const action of actions) {
      lines.push(`- ${action}`);
    }
  }

  return lines.join("\n");
};
