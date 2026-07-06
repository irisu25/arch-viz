import * as fs from 'fs';
import * as path from 'path';

export interface PathAliases {
  /** Absolute path to the baseUrl directory */
  baseUrl: string;
  /** Map of alias pattern → list of replacement paths (relative to baseUrl) */
  paths: Record<string, string[]>;
}

/**
 * Strips JSONC-style comments and trailing commas so tsconfig.json can be
 * parsed with the standard JSON.parse. This handles the most common cases
 * (single-line //, block /* *\/, trailing commas) but is not a full JSONC parser.
 */
function stripJsonc(text: string): string {
  // Remove block comments first to avoid treating /* inside strings as comments
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')   // /* block comments */
    .replace(/\/\/[^\n]*/g, '')          // // single-line comments
    .replace(/,(\s*[}\]])/g, '$1');      // trailing commas before } or ]
}

/**
 * Loads path alias configuration from tsconfig.json or jsconfig.json in the
 * given project root. Supports `baseUrl` and `paths` (compilerOptions).
 *
 * Handles one level of `extends` — if the config extends another file that
 * also defines paths/baseUrl, those are merged in (child values win).
 *
 * Returns null if no alias configuration is found.
 */
export function loadAliases(projectRoot: string): PathAliases | null {
  const candidates = ['tsconfig.json', 'jsconfig.json'];

  for (const filename of candidates) {
    const configPath = path.join(projectRoot, filename);
    if (!fs.existsSync(configPath)) continue;

    try {
      const result = parseConfig(configPath, projectRoot);
      if (result && (Object.keys(result.paths).length > 0 || result.baseUrl !== projectRoot)) {
        return result;
      }
    } catch {
      // Malformed config — try next candidate
    }
  }

  return null;
}

function parseConfig(configPath: string, projectRoot: string): PathAliases | null {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const json = JSON.parse(stripJsonc(raw));

  const configDir = path.dirname(configPath);
  const opts = json.compilerOptions ?? {};

  // Resolve baseUrl relative to the config file's directory
  const baseUrl = opts.baseUrl
    ? path.resolve(configDir, opts.baseUrl)
    : projectRoot;

  let paths: Record<string, string[]> = opts.paths ?? {};

  // Handle one level of `extends` — merge parent config's paths/baseUrl
  if (json.extends) {
    const parentPath = require.resolve(json.extends, { paths: [configDir] });
    try {
      const parent = parseConfig(parentPath, projectRoot);
      if (parent) {
        // Child paths override parent paths; child baseUrl wins if set
        paths = { ...parent.paths, ...paths };
      }
    } catch {
      // Parent config not found or invalid — ignore
    }
  }

  return { baseUrl, paths };
}
