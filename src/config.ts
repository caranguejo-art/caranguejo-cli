import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";

export interface CliConfig {
  apiKey?: string;
  baseUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".caranguejo");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function readConfig(): CliConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as CliConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  try { chmodSync(CONFIG_PATH, 0o600); } catch { /* windows / best-effort */ }
}

export function clearConfig(): void {
  try { rmSync(CONFIG_PATH); } catch { /* not there */ }
}

export function configPath(): string {
  return CONFIG_PATH;
}

/** Resolve the effective API key: env var wins over the stored config. */
export function resolveApiKey(): string | undefined {
  return process.env.CARANGUEJO_API_KEY || readConfig().apiKey;
}

export function resolveBaseUrl(): string | undefined {
  return process.env.CARANGUEJO_BASE_URL || readConfig().baseUrl;
}
