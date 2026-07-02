#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { exec } from 'child_process';
import { findTargetFiles } from './utils/scanner';
import { extractDependencies } from './utils/extractor';
import { generateHTML } from './utils/generator';

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

function buildGraph() {
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
    console.warn(`\x1b[33m[Warning]\x1b[0m Found ${orphanFiles.length} potentially orphaned files:`);
    orphanFiles.forEach(f => console.warn(`  - ${path.basename(f.filePath)}`));
  }

  const outputPath = path.join(process.cwd(), 'arch-viz-output.html');
  generateHTML(dependencies, outputPath);
  console.log(`Successfully generated graph for ${files.length} files.`);
  
  return outputPath;
}

try {
  const outputPath = buildGraph();

  if (!isWatchMode) {
    exec(`start "" "${outputPath}"`);
  } else {
    console.log(`Starting watch server...`);
    let clients: http.ServerResponse[] = [];

    const server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(outputPath));
      } else if (req.url === '/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        clients.push(res);
        req.on('close', () => {
          clients = clients.filter(c => c !== res);
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const PORT = 3030;
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      exec(`start http://localhost:${PORT}`);
    });

    let debounceTimer: NodeJS.Timeout;
    fs.watch(absoluteTargetDir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.includes('node_modules') || filename.includes('.git'))) return;
      
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log(`Change detected in ${filename}. Rebuilding...`);
        buildGraph();
        clients.forEach(c => c.write(`data: reload\n\n`));
      }, 300);
    });
  }
} catch (error: any) {
  console.error("Failed to generate visualization:", error.message);
  process.exit(1);
}
