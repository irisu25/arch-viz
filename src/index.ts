#!/usr/bin/env node

import * as path from 'path';
import { findTargetFiles } from './utils/scanner';

console.log("Welcome to arch-viz!");

// Ambil path dari argumen terminal (default ke folder saat ini: '.')
// process.argv[2] adalah argumen pertama setelah `node` dan `index.js`
const targetDir = process.argv[2] || '.';
const absoluteTargetDir = path.resolve(process.cwd(), targetDir);

console.log(`Scanning directory: ${absoluteTargetDir}`);

try {
  // Panggil fungsi scanner kita
  const files = findTargetFiles(absoluteTargetDir);
  
  console.log(`Found ${files.length} code files!`);
  // Menampilkan 5 file pertama sebagai contoh saja
  files.slice(0, 5).forEach(file => console.log(`- ${file}`));
  
  if (files.length > 5) {
    console.log(`... and ${files.length - 5} more files.`);
  }
} catch (error: any) {
  console.error("Error scanning directory:", error.message);
}

