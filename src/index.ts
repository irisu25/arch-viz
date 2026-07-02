#!/usr/bin/env node

import * as path from 'path';
import { exec } from 'child_process';
import { findTargetFiles } from './utils/scanner';
import { extractDependencies } from './utils/extractor';
import { generateHTML } from './utils/generator';

const targetDir = process.argv[2] || '.';
const absoluteTargetDir = path.resolve(process.cwd(), targetDir);

try {
  console.log(`Scanning: ${absoluteTargetDir}`);
  const files = findTargetFiles(absoluteTargetDir);
  
  if (files.length === 0) {
    console.log('No supported code files found.');
    process.exit(0);
  }

  const dependencies = extractDependencies(files);
  
  // Deteksi Circular Dependencies
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
  
  if (circularCount > 0) {
    console.log(`Found ${circularCount / 2} circular dependencies (bidirectional).`);
  }

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
    console.warn(`\n\x1b[33m[Warning]\x1b[0m Found ${orphanFiles.length} potentially orphaned files:`);
    orphanFiles.forEach(f => console.warn(`  - ${path.basename(f.filePath)}`));
    console.warn();
  }

  const outputPath = path.join(process.cwd(), 'arch-viz-output.html');
  
  generateHTML(dependencies, outputPath);
  
  console.log(`Successfully generated graph for ${files.length} files.`);
  exec(`start "" "${outputPath}"`);
} catch (error: any) {
  console.error("Failed to generate visualization:", error.message);
  process.exit(1);
}

