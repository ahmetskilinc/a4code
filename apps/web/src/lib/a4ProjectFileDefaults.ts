import {
  A4_PROJECT_FILE_NAME,
  type EnvironmentId,
  type ProjectReadFileResult,
  type A4ProjectFile,
} from "@a4code/contracts";
import { parseA4ProjectFile } from "@a4code/shared/a4ProjectFile";
import { executeAtomQuery } from "@a4code/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";

import {
  getProjectFileQueryAtom,
  resolveProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

function toA4ProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
  result: ProjectReadFileResult | null,
): A4ProjectFile | null {
  const data = resolveProjectFileQueryData(
    environmentId,
    workspaceRoot,
    A4_PROJECT_FILE_NAME,
    result,
  );
  if (data === null || data.exists === false || data.truncated) return null;
  return parseA4ProjectFile(data.contents);
}

export async function readA4ProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
  signal?: AbortSignal,
): Promise<A4ProjectFile | null> {
  const result = await executeAtomQuery(
    appAtomRegistry,
    getProjectFileQueryAtom(environmentId, workspaceRoot, A4_PROJECT_FILE_NAME),
    { reportDefect: false, reportFailure: false, signal },
  );
  return toA4ProjectFile(
    environmentId,
    workspaceRoot,
    result._tag === "Success" ? result.value : null,
  );
}

/** The project's a4code.json from an earlier read, or `undefined` when none has loaded yet. */
export function peekA4ProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): A4ProjectFile | null | undefined {
  const result = appAtomRegistry.get(
    getProjectFileQueryAtom(environmentId, workspaceRoot, A4_PROJECT_FILE_NAME),
  );
  return AsyncResult.isSuccess(result)
    ? toA4ProjectFile(environmentId, workspaceRoot, result.value)
    : undefined;
}
