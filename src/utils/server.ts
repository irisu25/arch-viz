import * as http from 'http';
import * as fs from 'fs';
import { exec } from 'child_process';

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
    exec(`start http://localhost:${PORT}`);
  });

  let debounceTimer: NodeJS.Timeout;
  fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.includes('node_modules') || filename.includes('.git'))) return;
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`Change detected in ${filename}. Rebuilding...`);
      onRebuild();
      clients.forEach(c => c.write(`data: reload\n\n`));
    }, 300);
  });
}
