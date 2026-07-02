#!/usr/bin/env node

import * as path from 'path';
import { findTargetFiles } from './utils/scanner';
import { extractDependencies } from './utils/extractor';

console.log("Welcome to arch-viz!");

// Ambil path dari argumen terminal
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
  
  // Menampilkan contoh hasil ekstraksi (max 3 file pertama yang punya import)
  const filesWithImports = dependencies.filter(d => d.imports.length > 0);
  console.log(`\nContoh Relasi Import yang Ditemukan:`);
  
  filesWithImports.slice(0, 3).forEach(node => {
    // Ambil nama file saja dari path panjang biar rapi
    const fileName = path.basename(node.filePath);
    console.log(`\n📄 ${fileName} depends on:`);
    node.imports.forEach(imp => console.log(`   -> ${imp}`));
  });

} catch (error: any) {
  console.error("Error:", error.message);
}

