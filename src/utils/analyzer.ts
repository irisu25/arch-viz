import * as path from 'path';
import { DependencyNode } from './extractor';
import { resolveImport } from './resolver';
import { PathAliases } from './aliases';

export function detectCircularDependencies(
  dependencies: DependencyNode[],
  aliases?: PathAliases | null
): number {
  const allFiles = new Set(dependencies.map(d => d.filePath));

  // Build a proper adjacency graph using fully resolved file paths instead of
  // basename matching, which was producing false positives for same-named files
  // in different folders (e.g. utils/index.ts vs hooks/index.ts).
  const graph = new Map<string, string[]>();
  for (const node of dependencies) {
    const targets: string[] = [];
    for (const imp of node.imports) {
      const resolved = resolveImport(node.filePath, imp, allFiles, aliases);
      if (resolved) targets.push(resolved);
    }
    graph.set(node.filePath, targets);
  }

  // DFS-based cycle detection (gray-white-black coloring).
  // The original algorithm only caught direct cycles (A → B → A).
  // This approach catches all cycles, including indirect ones (A → B → C → A).
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const reportedCycles = new Set<string>();
  let circularCount = 0;

  function dfs(node: string, stack: string[]): void {
    visited.add(node);
    inStack.add(node);

    for (const neighbor of (graph.get(node) ?? [])) {
      if (inStack.has(neighbor)) {
        // Reconstruct the cycle path from the stack
        const cycleStart = stack.indexOf(neighbor);
        const cycle = stack.slice(cycleStart);

        // Deduplicate cycles that were found from different starting nodes
        const cycleKey = [...cycle].sort().join('|');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          const names = cycle.map(p => path.basename(p));
          console.warn(
            `\x1b[33m[Warning]\x1b[0m Circular dependency: ${names.join(' → ')} → ${path.basename(neighbor)}`
          );
          circularCount++;
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor, [...stack, neighbor]);
      }
    }

    inStack.delete(node);
  }

  for (const node of dependencies) {
    if (!visited.has(node.filePath)) {
      dfs(node.filePath, [node.filePath]);
    }
  }

  return circularCount;
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
