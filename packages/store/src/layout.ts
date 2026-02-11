import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const resolveCocHome = (overridePath?: string): string =>
  overridePath ?? process.env.COC_HOME ?? join(process.cwd(), ".coc");

export type CocPaths = {
  cocHome: string;
  keysDir: string;
  artifactsDir: string;
  tracesDir: string;
  indexDir: string;
};

export const buildCocPaths = (cocHome: string): CocPaths => ({
  cocHome,
  keysDir: join(cocHome, "keys"),
  artifactsDir: join(cocHome, "artifacts", "sha256"),
  tracesDir: join(cocHome, "traces"),
  indexDir: join(cocHome, "index")
});

export const ensureCocLayout = (cocHome: string): CocPaths => {
  const paths = buildCocPaths(cocHome);
  mkdirSync(paths.cocHome, { recursive: true });
  mkdirSync(paths.keysDir, { recursive: true });
  mkdirSync(paths.artifactsDir, { recursive: true });
  mkdirSync(paths.tracesDir, { recursive: true });
  mkdirSync(paths.indexDir, { recursive: true });
  return paths;
};

export const ensureDirectory = (directoryPath: string): void => {
  mkdirSync(directoryPath, { recursive: true });
};

export const fileExists = (filePath: string): boolean => existsSync(filePath);
