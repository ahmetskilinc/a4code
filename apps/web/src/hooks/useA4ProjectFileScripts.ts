import {
  A4_PROJECT_FILE_NAME,
  type EnvironmentId,
  type A4ProjectFile,
  type A4ProjectFileScript,
} from "@a4code/contracts";
import { parseA4ProjectFile } from "@a4code/shared/a4ProjectFile";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<A4ProjectFileScript> = [];

export interface A4ProjectFileState {
  status: "loading" | "missing" | "invalid" | "valid";
  file: A4ProjectFile | null;
  scripts: ReadonlyArray<A4ProjectFileScript>;
  refresh: () => void;
}

export function useA4ProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): A4ProjectFileState {
  const query = useProjectFileQuery(environmentId, cwd ?? "", A4_PROJECT_FILE_NAME, cwd !== null);
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  const refresh = query.refresh;
  if (contents === null) {
    return {
      status: isPending ? "loading" : "missing",
      file: null,
      scripts: NO_SCRIPTS,
      refresh,
    } as const;
  }
  const file = parseA4ProjectFile(contents);
  if (file === null) {
    return { status: "invalid", file: null, scripts: NO_SCRIPTS, refresh } as const;
  }
  return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS, refresh } as const;
}
