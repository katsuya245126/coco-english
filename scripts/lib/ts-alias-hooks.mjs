import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../../src/", import.meta.url);

function withTsExtension(url) {
  const path = fileURLToPath(url);
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      if (candidate === path && !/\.[cm]?[jt]sx?$/.test(path)) continue;
      return pathToFileURL(candidate).href;
    }
  }
  return url.href;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return { url: withTsExtension(new URL(specifier.slice(2), SRC)), shortCircuit: true };
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:") &&
    !context.parentURL.includes("/node_modules/")
  ) {
    return { url: withTsExtension(new URL(specifier, context.parentURL)), shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (error) {
    // Packages without an exports map (e.g. `next/headers`) need the .js suffix under ESM.
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || /^[./]|\.[cm]?js$/.test(specifier)) throw error;
    return next(`${specifier}.js`, context);
  }
}

export async function load(url, context, next) {
  if (/\.m?tsx?$/.test(url) && !url.includes("/node_modules/")) {
    return next(url, { ...context, format: "module-typescript" });
  }
  return next(url, context);
}
