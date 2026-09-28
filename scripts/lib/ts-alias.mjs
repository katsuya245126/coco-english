// Lets `node --import ./scripts/lib/ts-alias.mjs script.ts` run app TypeScript:
// maps `@/` to `src/` and resolves extensionless relative .ts imports.
import { register } from "node:module";

register("./ts-alias-hooks.mjs", import.meta.url);
