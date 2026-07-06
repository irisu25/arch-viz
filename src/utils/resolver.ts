import * as path from 'path';
import { PathAliases } from './aliases';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Tries to resolve an absolute path candidate against the known file set,
 * automatically trying common extensions and directory index files.
 */
function tryResolve(candidate: string, allFiles: Set<string>): string | null {
  // 1. Exact match (import already has an extension)
  if (allFiles.has(candidate)) return candidate;

  // 2. Try appending each extension (e.g. './scanner' → './scanner.ts')
  for (const ext of EXTENSIONS) {
    const withExt = candidate + ext;
    if (allFiles.has(withExt)) return withExt;
  }

  // 3. Try as a directory index (e.g. './components' → './components/index.tsx')
  for (const ext of EXTENSIONS) {
    const indexFile = path.join(candidate, 'index' + ext);
    if (allFiles.has(indexFile)) return indexFile;
  }

  return null;
}

/**
 * Matches an import string against a tsconfig path alias pattern.
 * Patterns may contain a single '*' wildcard (e.g. "@/*", "@components/*").
 *
 * Returns the captured wildcard portion on match, '' on exact match,
 * or null if the pattern does not match.
 */
function matchAliasPattern(imp: string, pattern: string): string | null {
  const starIdx = pattern.indexOf('*');

  if (starIdx === -1) {
    // Exact pattern (no wildcard)
    return imp === pattern ? '' : null;
  }

  const prefix = pattern.slice(0, starIdx);
  const suffix = pattern.slice(starIdx + 1);

  if (imp.startsWith(prefix) && imp.endsWith(suffix)) {
    const captured = imp.slice(prefix.length, imp.length - suffix.length || undefined);
    return captured;
  }

  return null;
}

/**
 * Tries to resolve a non-relative import string using configured path aliases
 * (tsconfig `paths`) and `baseUrl` bare imports.
 */
function resolveAlias(
  imp: string,
  aliases: PathAliases,
  allFiles: Set<string>
): string | null {
  const { baseUrl, paths } = aliases;

  // 1. Try each configured alias pattern in order
  for (const [pattern, replacements] of Object.entries(paths)) {
    const captured = matchAliasPattern(imp, pattern);
    if (captured === null) continue;

    for (const replacement of replacements) {
      // Replace the '*' in the replacement template with the captured portion
      const resolved = replacement.includes('*')
        ? replacement.replace('*', captured)
        : replacement;

      const found = tryResolve(path.resolve(baseUrl, resolved), allFiles);
      if (found) return found;
    }
  }

  // 2. Try as a bare baseUrl import (e.g. 'utils/helper' → '<baseUrl>/utils/helper.ts')
  //    Only when no alias pattern matched — avoids false positives on npm package names.
  const fromBase = tryResolve(path.resolve(baseUrl, imp), allFiles);
  if (fromBase) return fromBase;

  return null;
}

/**
 * Resolves an import string from a source file to its absolute file path.
 *
 * Resolution order:
 *  1. Relative imports (starts with '.' or '/') — resolved against the source file's dir
 *  2. Alias imports — resolved using tsconfig paths + baseUrl (if aliases provided)
 *
 * Returns null for unresolvable external npm packages.
 */
export function resolveImport(
  fromFile: string,
  imp: string,
  allFiles: Set<string>,
  aliases?: PathAliases | null
): string | null {
  // --- Relative imports ---
  if (imp.startsWith('.') || imp.startsWith('/')) {
    const dir = path.dirname(fromFile);
    return tryResolve(path.resolve(dir, imp), allFiles);
  }

  // --- Alias / baseUrl imports ---
  if (aliases) {
    return resolveAlias(imp, aliases, allFiles);
  }

  return null;
}
