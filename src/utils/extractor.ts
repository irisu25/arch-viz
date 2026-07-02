import * as fs from 'fs';

export interface DependencyNode {
  filePath: string;
  imports: string[];
}

/**
 * Membaca isi file dan mengekstrak semua tulisan `import` atau `require`.
 * 
 * @param filePaths Array dari absolute path file yang akan dibedah
 * @returns Array object berisi relasi dependency per file
 */
export function extractDependencies(filePaths: string[]): DependencyNode[] {
  const nodes: DependencyNode[] = [];

  // Regex untuk menangkap ES6 Import: import ... from 'module-name'
  const importRegex = /import\s+(?:.*?\s+from\s+)?['"](.*?)['"]/g;
  
  // Regex untuk menangkap CommonJS Require: require('module-name')
  const requireRegex = /require\(['"](.*?)['"]\)/g;

  for (const filePath of filePaths) {
    try {
      // Baca teks/isi file
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const imports: string[] = [];
      let match;

      // Cari semua ES6 imports
      while ((match = importRegex.exec(fileContent)) !== null) {
        if (match[1]) imports.push(match[1]); // match[1] adalah nama modulnya
      }

      // Cari semua CommonJS requires
      while ((match = requireRegex.exec(fileContent)) !== null) {
        if (match[1]) imports.push(match[1]);
      }

      nodes.push({ filePath, imports });
    } catch (error) {
      console.error(`Gagal membaca file ${filePath}`);
    }
  }

  return nodes;
}
