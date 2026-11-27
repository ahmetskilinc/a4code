import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { A4_PROJECT_FILE_NAME, type A4ProjectFile } from "@a4code/contracts";
import { A4ProjectFileFromJson } from "@a4code/shared/a4ProjectFile";

const decodeA4ProjectFileJson = Schema.decodeEffect(A4ProjectFileFromJson);

export class A4ProjectFileLoadError extends Schema.TaggedError<A4ProjectFileLoadError>()(
  "A4ProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${A4_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

export class A4ProjectFileLoader extends Context.Service<
  A4ProjectFileLoader,
  {
    /** Never fails; missing/unreadable/invalid files return none, with warnings for invalid files. */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<A4ProjectFile>>;
  }
>()("a4code/project/A4ProjectFileLoader") {}

const logA4ProjectFileLoadError = (error: A4ProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** @public */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: A4ProjectFileLoader["Service"]["load"] = Effect.fn("A4ProjectFileLoader.load")(
    function* (workspaceRoot) {
      const filePath = path.join(workspaceRoot, A4_PROJECT_FILE_NAME);
      const raw = yield* fileSystem.readFileString(filePath).pipe(
        Effect.asSome,
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(Option.none<string>())
              : logA4ProjectFileLoadError(
                  new A4ProjectFileLoadError({
                    operation: "read",
                    workspaceRoot,
                    filePath,
                    cause: error,
                  }),
                ).pipe(Effect.as(Option.none<string>())),
        }),
      );
      if (Option.isNone(raw)) {
        return Option.none<A4ProjectFile>();
      }
      return yield* decodeA4ProjectFileJson(raw.value).pipe(
        Effect.asSome,
        Effect.catchTags({
          SchemaError: (error) =>
            logA4ProjectFileLoadError(
              new A4ProjectFileLoadError({
                operation: "decode",
                workspaceRoot,
                filePath,
                cause: error,
              }),
            ).pipe(Effect.as(Option.none<A4ProjectFile>())),
        }),
      );
    },
  );

  return A4ProjectFileLoader.of({ load });
});

export const layer = Layer.effect(A4ProjectFileLoader, make);
