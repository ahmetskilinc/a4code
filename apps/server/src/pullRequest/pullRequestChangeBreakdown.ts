import type { PullRequestChangeBreakdown } from "@a4code/contracts";
import { summarizeChangedFiles } from "@a4code/shared/changedFileKind";
import type { ProviderFileStats } from "@a4code/source-control-core/server/PullRequestProvider";

export function toChangeBreakdown(stats: ProviderFileStats): PullRequestChangeBreakdown {
  if (stats.truncated) return null;
  return summarizeChangedFiles(stats.files);
}
