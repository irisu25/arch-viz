import * as path from 'path';
import { DependencyNode } from './extractor';

export function detectCircularDependencies(dependencies: DependencyNode[]): number {
  let circularCount = 0;
  dependencies.forEach(d => {
    d.imports.forEach(imp => {
      const target = dependencies.find(t => t.filePath.includes(path.basename(imp)));
      if (target) {
        const myName = path.basename(d.filePath);
        if (target.imports.some(timp => timp.includes(myName))) {
          console.warn(`\x1b[33m[Warning]\x1b[0m Circular dependency detected: ${myName} <-> ${path.basename(target.filePath)}`);
          circularCount++;
        }
      }
    });
  });
  return circularCount / 2;
}

export function detectOrphanFiles(dependencies: DependencyNode[]): void {
  const ENTRY_POINTS = new Set([
    'index.ts', 'index.js', 'index.jsx', 'index.tsx', 
    'app.jsx', 'app.tsx', 'main.ts', 'main.js', 'main.jsx', 'main.tsx'
  ]);

  const orphanFiles = dependencies.filter(d => {
    const fileName = path.basename(d.filePath);
    const fileNameWithoutExt = path.parse(d.filePath).name;
    
    if (ENTRY_POINTS.has(fileName.toLowerCase())) return false;

    const isImported = dependencies.some(otherNode => 
      otherNode.filePath !== d.filePath && 
      otherNode.imports.some(imp => {
        const base = path.basename(imp);
        return base === fileNameWithoutExt || base === fileName;
      })
    );

    return !isImported;
  });

  if (orphanFiles.length > 0) {
    console.warn(`\x1b[33m[Warning]\x1b[0m Found ${orphanFiles.length} potentially orphaned files:`);
    orphanFiles.forEach(f => console.warn(`  - ${path.basename(f.filePath)}`));
  }
}
