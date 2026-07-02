import * as fs from 'fs';

export interface DependencyNode {
  filePath: string;
  imports: string[];
}

export function extractDependencies(filePaths: string[]): DependencyNode[] {
  const importRegex = /import\s+(?:.*?\s+from\s+)?['"](.*?)['"]/g;
  const requireRegex = /require\(['"](.*?)['"]\)/g;

  return filePaths.map(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const imports: string[] = [];
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }
      
      while ((match = requireRegex.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }

      return { filePath, imports };
    } catch {
      return { filePath, imports: [] };
    }
  });
}
