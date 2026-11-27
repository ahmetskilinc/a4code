import { makeSecretProviderDefinitionRegistry } from "@a4code/secret-provider-core/shared/definition";
import * as OnePassword from "@a4code/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
