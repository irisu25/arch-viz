import * as fs from 'fs';
import * as path from 'path';

export interface ArchVizConfig {
  /** Folders to ignore during scanning (same as --ignore=) */
  ignore?: string[];
  /** Preferred editor for double-click to open (same as --editor=) */
  editor?: string;
  /** Auto-enable watch mode (same as --watch) */
  watch?: boolean;
}

const CONFIG_FILENAMES = ['.arch-viz.json', 'arch-viz.config.json'];

/**
 * Searches for a config file in the given directory and parses it.
 * Supported filenames (checked in order):
 *   - .arch-viz.json
 *   - arch-viz.config.json
 *
 * Returns an empty object if no config file is found.
 * Warns to stderr if a config file is found but cannot be parsed.
 */
export function loadConfig(projectRoot: string): ArchVizConfig {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(projectRoot, filename);
    if (!fs.existsSync(configPath)) continue;

    try {
      const raw = fs.readFileSync(configPath, 'utf-8')
        .replace(/^\uFEFF/, ''); // strip UTF-8 BOM added by Windows tools (Notepad, PowerShell)
      const parsed = JSON.parse(raw) as ArchVizConfig;
      console.log(`Config: loaded ${filename}`);
      return parsed;
    } catch (err: any) {
      console.warn(`\x1b[33m[Warning]\x1b[0m Failed to parse ${filename}: ${err.message}`);
      return {};
    }
  }

  return {};
}
