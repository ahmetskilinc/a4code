import { assert, it } from "@effect/vitest";

import {
  repositoryPathFromRemoteUrl,
  transportSafeSourceControlErrorValue,
} from "./SourceControlProvider.ts";

it("removes URL credentials, query parameters, and fragments from error transport values", () => {
  assert.strictEqual(
    transportSafeSourceControlErrorValue(
      "https://user:secret@example.test/org/repo/pull/42?token=secret#discussion",
    ),
    "https://example.test/org/repo/pull/42",
  );
});

it.each([
  ["git@github.com:A4Code/a4code.git", "A4Code/a4code"],
  ["git@github.com:/A4Code/a4code.git", "A4Code/a4code"],
  ["github.com:A4Code/a4code.git", "A4Code/a4code"],
  ["github.com:/A4Code/a4code.git", "A4Code/a4code"],
  ["gitlab.com:A4Code/platform/a4code", "A4Code/platform/a4code"],
  ["hg::user@host:Owner/Repo.git", null],
  ["https://github.com/A4Code/a4code.git", "A4Code/a4code"],
  ["https://github.com/A4Code/a4code.git?view=compact", "A4Code/a4code"],
  ["https://github.com/A4Code/a4code.git#section", "A4Code/a4code"],
  ["C:/repos/a4code", null],
  ["file:///tmp/A4Code/a4code.git", null],
])("reads the repository path of %s", (remoteUrl, expected) => {
  assert.strictEqual(repositoryPathFromRemoteUrl(remoteUrl), expected);
});
