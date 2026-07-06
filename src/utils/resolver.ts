import * as path from 'path';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Resolves a relative import string from a source file to its full, absolute file path.
 * Tries common extensions and directory index files automatically.
 *
 * Returns null if:
 * - The import is an external npm package (does not start with '.' or '/')
 * - The resolved path cannot be matched against any known file in the project
 */
export function resolveImport(
  fromFile: string,
  imp: string,
  allFiles: Set<string>
): string | null {
  // External packages or path aliases (e.g. '@/', '~/')
  if (!imp.startsWith('.') && !imp.startsWith('/')) return null;

  const dir = path.dirname(fromFile);
  const resolved = path.resolve(dir, imp);

  // 1. Exact match (e.g. import with explicit extension)
  if (allFiles.has(resolved)) return resolved;

  // 2. Try appending each supported extension (e.g. './utils/scanner' → './utils/scanner.ts')
  for (const ext of EXTENSIONS) {
    const candidate = resolved + ext;
    if (allFiles.has(candidate)) return candidate;
  }

  // 3. Try as a directory with an index file (e.g. './components' → './components/index.tsx')
  for (const ext of EXTENSIONS) {
    const candidate = path.join(resolved, 'index' + ext);
    if (allFiles.has(candidate)) return candidate;
  }

  return null;
}
