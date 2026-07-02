import * as fs from 'fs';

export interface DependencyNode {
  filePath: string;
  imports: string[];
  sizeKb: number;
}

export function extractDependencies(filePaths: string[]): DependencyNode[] {
  const importRegex = /import\s+(?:.*?\s+from\s+)?['"](.*?)['"]/g;
  const requireRegex = /require\(['"](.*?)['"]\)/g;

  return filePaths.map(filePath => {
    try {
      const stat = fs.statSync(filePath);
      const sizeKb = Math.round((stat.size / 1024) * 100) / 100;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const imports: string[] = [];
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }
      
      while ((match = requireRegex.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }

      return { filePath, imports, sizeKb };
    } catch {
      return { filePath, imports: [], sizeKb: 0 };
    }
  });
}
