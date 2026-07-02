import * as fs from 'fs';
import * as path from 'path';

// Ekstensi file yang akan kita baca
const TARGET_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
// Folder yang harus diabaikan agar tidak lambat
const IGNORED_FOLDERS = ['node_modules', '.git', 'dist', 'build', '.next'];

/**
 * Mencari semua file dengan ekstensi target secara rekursif dalam sebuah folder.
 * 
 * @param dirPath - Path folder yang ingin di-scan
 * @param fileList - (Internal) list file yang sedang dikumpulkan
 * @returns Array dari absolute path file yang ditemukan
 */
export function findTargetFiles(dirPath: string, fileList: string[] = []): string[] {
  // Baca isi folder saat ini
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Jika ini adalah folder, dan tidak ada di daftar IGNORED_FOLDERS,
      // kita telusuri lagi ke dalamnya (rekursif).
      if (!IGNORED_FOLDERS.includes(file)) {
        findTargetFiles(fullPath, fileList);
      }
    } else {
      // Jika ini adalah file, cek ekstensinya.
      const ext = path.extname(fullPath);
      if (TARGET_EXTENSIONS.includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
}
