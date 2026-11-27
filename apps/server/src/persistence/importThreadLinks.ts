import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export const rewriteImportedThreadLinks = Effect.fn("rewriteImportedThreadLinks")(
  function* (identity?: { readonly source: string; readonly destination: string }) {
    const sql = yield* SqlClient.SqlClient;
    const oldProtocol = "t3-thread://";
    const oldHosted = "https://app.t3.codes/threads/";
    const replacements: ReadonlyArray<readonly [string, string]> = [
      ...(identity
        ? ([
            [
              oldProtocol + "v2/" + identity.source + "/",
              "a4-thread://v2/" + identity.destination + "/",
            ],
            [
              oldHosted + encodeURIComponent(identity.source) + "/",
              "a4code://threads/" + identity.destination + "/",
            ],
          ] as const)
        : []),
      [oldProtocol + "v1/", "a4-thread://v1/"],
      [oldProtocol + "v2/", "a4-thread://v2/"],
      [oldHosted, "a4code://threads/"],
    ] as const;
    const fields = yield* sql<{ name: string; field: string }>`
    SELECT t.name, c.name AS field
    FROM sqlite_master t, pragma_table_info(t.name) c
    WHERE t.type='table' AND (
      t.name IN ('orchestration_events', 'orchestration_v2_events', 'projection_thread_messages') OR
      t.name GLOB 'orchestration_v2_projection_*'
    ) AND (c.name = 'text' OR c.name = 'payload_json')`;
    for (const { name, field } of fields) {
      const column = sql(field);
      const replacement = replacements.reduce(
        (value, [from, to]) => sql`replace(${value}, ${from}, ${to})`,
        sql`${column}`,
      );
      yield* sql`UPDATE ${sql(name)} SET ${column} = ${replacement}
      WHERE instr(${column}, ${oldProtocol}) > 0 OR instr(${column}, ${oldHosted}) > 0`;
    }
  },
);
