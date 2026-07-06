import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { openInBrowser } from './open';

export function startWatchServer(outputPath: string, watchDir: string, onRebuild: () => void) {
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
    openInBrowser(`http://localhost:${PORT}`);
  });

  let debounceTimer: NodeJS.Timeout;
  fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // Filter by exact path segments to avoid false matches on filenames
    // that happen to contain 'node_modules' or '.git' as a substring.
    const segments = filename.split(path.sep);
    if (segments.some(s => s === 'node_modules' || s === '.git')) return;

    // Ignore changes to the output file itself to prevent infinite rebuild loops.
    if (path.basename(filename) === 'arch-viz-output.html') return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`Change detected in ${filename}. Rebuilding...`);
      onRebuild();
      clients.forEach(c => c.write(`data: reload\n\n`));
    }, 300);
  });
}
