import * as fs from 'fs';
import * as path from 'path';

const TARGET_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const IGNORED_FOLDERS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

export function findTargetFiles(dirPath: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORED_FOLDERS.has(file)) {
        findTargetFiles(fullPath, fileList);
      }
    } else {
      const ext = path.extname(fullPath);
      if (TARGET_EXTENSIONS.has(ext)) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
}
