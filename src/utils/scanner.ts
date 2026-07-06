import * as fs from 'fs';
import * as path from 'path';

const TARGET_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const BASE_IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

export function findTargetFiles(dirPath: string, customIgnores: string[] = []): string[] {
  const ignoredFolders = new Set([...BASE_IGNORED, ...customIgnores]);
  const results: string[] = [];

  function walk(dir: string): void {
    // withFileTypes avoids a separate statSync call per entry
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Skip directories we can't read (e.g. permission errors)
      return;
    }

    for (const entry of entries) {
      // Skip symlinks to avoid infinite loops on circular symlink structures
      if (entry.isSymbolicLink()) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredFolders.has(entry.name)) walk(fullPath);
      } else if (entry.isFile()) {
        if (TARGET_EXTENSIONS.has(path.extname(entry.name))) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dirPath);
  return results;
}
