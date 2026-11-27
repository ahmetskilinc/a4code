import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { A4ProjectFile } from "@a4code/contracts";

import { fromLenientJson } from "./schemaJson.ts";

export const A4ProjectFileFromJson = fromLenientJson(A4ProjectFile);

const decodeA4ProjectFile = Schema.decodeExit(A4ProjectFileFromJson);

export function parseA4ProjectFile(contents: string): A4ProjectFile | null {
  const decoded = decodeA4ProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

export function buildA4ProjectFileJsonSchema(): Record<string, unknown> {
  const document = Schema.toJsonSchemaDocument(A4ProjectFile, { onExcessProperty: "error" });
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
