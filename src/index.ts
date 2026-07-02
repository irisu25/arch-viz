#!/usr/bin/env node

import * as path from 'path';
import { exec } from 'child_process';
import { findTargetFiles } from './utils/scanner';
import { extractDependencies } from './utils/extractor';
import { generateHTML } from './utils/generator';

console.log("Welcome to arch-viz!");

const targetDir = process.argv[2] || '.';
const absoluteTargetDir = path.resolve(process.cwd(), targetDir);

console.log(`Scanning directory: ${absoluteTargetDir}`);

try {
  // 1. Scan semua file
  const files = findTargetFiles(absoluteTargetDir);
  console.log(`Found ${files.length} code files!`);
  
  // 2. Ekstrak dependency dari file yang ditemukan
  console.log(`Extracting dependencies...`);
  const dependencies = extractDependencies(files);
  
  // 3. Generate HTML
  const outputFileName = 'arch-viz-output.html';
  const outputPath = path.join(process.cwd(), outputFileName);
  console.log(`Generating visualization...`);
  generateHTML(dependencies, outputPath);
  
  console.log(`✅ Success! Opening ${outputFileName} in your browser...`);
  
  // Buka otomatis di browser (berlaku untuk Windows)
  exec(`start "" "${outputPath}"`);

} catch (error: any) {
  console.error("Error:", error.message);
}

