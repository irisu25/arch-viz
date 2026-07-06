import * as fs from 'fs';

export interface DependencyNode {
  filePath: string;
  imports: string[];
  sizeKb: number;
}

export function extractDependencies(filePaths: string[]): DependencyNode[] {
  return filePaths.map(filePath => {
    // IMPORTANT: Regex with the /g flag is stateful (lastIndex persists between
    // exec() calls). They MUST be defined inside the map callback so each file
    // gets a fresh instance starting from lastIndex = 0.
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"`](.*?)['"`]/g;
    const requireRegex = /require\s*\(\s*['"`](.*?)['"`]\s*\)/g;
    const reExportRegex = /export\s+(?:\*|{[^}]*})\s+from\s+['"`](.*?)['"`]/g;
    const dynamicImportRegex = /import\s*\(\s*['"`](.*?)['"`]\s*\)/g;

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

      while ((match = reExportRegex.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }

      while ((match = dynamicImportRegex.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }

      return { filePath, imports, sizeKb };
    } catch {
      return { filePath, imports: [], sizeKb: 0 };
    }
  });
}
