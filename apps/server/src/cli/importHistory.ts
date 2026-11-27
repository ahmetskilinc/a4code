import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/cli";

class HistoryImportError extends Schema.TaggedError<HistoryImportError>()("HistoryImportError", {
  message: Schema.String,
}) {}

export const importHistory = Effect.fn("importHistory")(function* (
  source: string,
  destination: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sourceHome = yield* fs.realPath(source);
  const target = path.resolve(destination);
  const parent = yield* fs.realPath(path.dirname(target));
  const targetHome = path.join(parent, path.basename(target));
  const relative = path.relative(sourceHome, targetHome);
  if (
    !relative ||
    !(relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
  ) {
    return yield* new HistoryImportError({ message: "Choose a new home outside the source home." });
  }
  if (yield* fs.exists(targetHome))
    return yield* new HistoryImportError({
      message: "The destination already exists. Choose a new home.",
    });
  const sourceState = path.join(sourceHome, "userdata");
  const snapshot = path.join(sourceState, "statev2.sqlite");
  if (
    (yield* fs.lstat(snapshot)).type !== "File" ||
    (yield* fs.lstat(sourceState)).type !== "Directory"
  )
    return yield* new HistoryImportError({
      message: "The source must contain a local userdata/statev2.sqlite database.",
    });

  const stage = yield* fs.makeTempDirectoryScoped({
    directory: parent,
    prefix: ".history-import-",
  });
  const { runMigrateDevDb } = yield* Effect.promise(
    () => import("../../scripts/migrate-dev-db.ts"),
  );
  const identityPath = path.join(sourceState, "environment-id");
  const oldId = yield* fs.lstat(identityPath).pipe(Effect.orElseSucceed(() => undefined));
  const sourceId =
    oldId?.type === "File" ? (yield* fs.readFileString(identityPath)).trim() : undefined;
  const destinationId = yield* (yield* SecureRandom.SecureRandom).uuidV4();
  const result = yield* runMigrateDevDb(
    {
      source: snapshot,
      baseDir: stage,
      projects: Number.MAX_SAFE_INTEGER,
      threadsPerProject: Number.MAX_SAFE_INTEGER,
    },
    {
      importHistory: true,
      ...(sourceId ? { linkIdentity: { source: sourceId, destination: destinationId } } : {}),
    },
  );

  const state = path.join(stage, "userdata");
  yield* fs.writeFileString(path.join(state, "environment-id"), destinationId, { mode: 0o600 });
  const attachments = path.join(sourceState, "attachments");
  if (yield* fs.exists(attachments)) {
    if ((yield* fs.lstat(attachments)).type === "Directory") {
      const dest = path.join(state, "attachments");
      yield* fs.makeDirectory(dest, { mode: 0o700 });
      for (const name of yield* fs.readDirectory(attachments)) {
        if (name.startsWith("pending-") || name.endsWith(".part")) continue;
        const file = path.join(attachments, name);
        if ((yield* fs.lstat(file)).type !== "File") continue;
        yield* fs.copyFile(file, path.join(dest, name));
      }
    }
  }

  // Reserving the destination with mkdir excludes a concurrent import or a newly initialized server.
  yield* fs.makeDirectory(targetHome, { mode: 0o700 });
  yield* fs
    .rename(state, path.join(targetHome, "userdata"))
    .pipe(Effect.onError(() => fs.remove(targetHome).pipe(Effect.ignore)));
  return {
    projects: result.projects.length,
    threads: result.projects.reduce((total, project) => total + project.threads, 0),
    home: targetHome,
  };
}, Effect.scoped);

export const importHistoryCommand = Command.make(
  "import-history",
  {
    from: Flag.String("from").pipe(
      Flag.withDescription("Existing server home containing userdata/statev2.sqlite."),
    ),
    to: Flag.String("to").pipe(
      Flag.withDescription("New destination home. Its parent directory must exist."),
    ),
  },
  Effect.fn("importHistoryCommand")(function* ({ from, to }) {
    const result = yield* importHistory(from, to);
    yield* Console.log(
      `Copied ${result.projects} projects and ${result.threads} settled threads to ${result.home}. Pair your devices with the new server.`,
    );
  }),
).pipe(
  Command.withDescription(
    "Import local project and settled thread history into a new server home.",
  ),
);
