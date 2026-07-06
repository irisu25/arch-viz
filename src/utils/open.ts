import { exec } from 'child_process';
import { platform } from 'os';

/**
 * Opens a URL or file path in the default browser in a cross-platform way.
 * Supports Windows (start), macOS (open), and Linux (xdg-open).
 */
export function openInBrowser(target: string): void {
  const p = platform();
  let cmd: string;

  if (p === 'win32') {
    // 'start' requires an empty title ("") so paths with spaces are handled correctly
    cmd = `start "" "${target}"`;
  } else if (p === 'darwin') {
    cmd = `open "${target}"`;
  } else {
    cmd = `xdg-open "${target}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.error(`\x1b[31m[Error]\x1b[0m Failed to open browser: ${err.message}`);
      console.log(`Please open manually: ${target}`);
    }
  });
}
