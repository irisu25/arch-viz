#!/usr/bin/env node

import * as path from 'path';
import { exec } from 'child_process';
import { findTargetFiles } from './utils/scanner';
import { extractDependencies } from './utils/extractor';
import { generateHTML } from './utils/generator';
import { detectCircularDependencies, detectOrphanFiles } from './utils/analyzer';
import { startWatchServer } from './utils/server';

let targetDir = '.';
let customIgnores: string[] = [];
let isWatchMode = false;

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--ignore=')) {
    customIgnores = arg.substring(9).split(',').map(s => s.trim());
  } else if (arg === '--watch' || arg === '-w') {
    isWatchMode = true;
  } else if (!arg.startsWith('-')) {
    targetDir = arg;
  }
}

const absoluteTargetDir = path.resolve(process.cwd(), targetDir);

function buildGraph(): string {
  console.log(`\nScanning: ${absoluteTargetDir}`);
  if (customIgnores.length > 0) {
    console.log(`Ignoring folders: ${customIgnores.join(', ')}`);
  }
  
  const files = findTargetFiles(absoluteTargetDir, customIgnores);
  
  if (files.length === 0) {
    console.log('No supported code files found.');
    process.exit(0);
  }

  const dependencies = extractDependencies(files);
  
  const circularCount = detectCircularDependencies(dependencies);
  if (circularCount > 0) {
    console.log(`Found ${circularCount} circular dependencies (bidirectional).`);
  }

  detectOrphanFiles(dependencies);

  const outputPath = path.join(process.cwd(), 'arch-viz-output.html');
  generateHTML(dependencies, outputPath);
  console.log(`Successfully generated graph for ${files.length} files.`);
  
  return outputPath;
}

try {
  const outputPath = buildGraph();

  if (isWatchMode) {
    startWatchServer(outputPath, absoluteTargetDir, buildGraph);
  } else {
    exec(`start "" "${outputPath}"`);
  }
} catch (error: any) {
  console.error("Failed to generate visualization:", error.message);
  process.exit(1);
}
