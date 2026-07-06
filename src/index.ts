#!/usr/bin/env node

import * as path from 'path';
import { findTargetFiles } from './utils/scanner';
import { extractDependencies } from './utils/extractor';
import { generateHTML, GeneratorOptions } from './utils/generator';
import { detectCircularDependencies, detectOrphanFiles } from './utils/analyzer';
import { startWatchServer } from './utils/server';
import { openInBrowser } from './utils/open';
import { loadAliases } from './utils/aliases';
import { loadConfig } from './utils/config';

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { version } = require('../package.json') as { version: string };
  console.log(`arch-viz v${version}`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Usage: arch-viz [directory] [options]

  Options:
    --ignore=<folders>  Comma-separated list of folders to ignore
                        e.g. --ignore=tests,stories
    --watch, -w         Watch mode — auto-rebuilds graph on file changes
    --editor=<editor>   Force a specific editor for double-click to open
                        Supported: vscode, cursor, webstorm, idea, subl
    --version, -v       Show version number
    --help, -h          Show this help message

  Config file (.arch-viz.json):
    Place a config file in your project root to avoid repeating flags.
    CLI arguments always override config file values.

    Example .arch-viz.json:
    {
      "ignore": ["tests", "stories", "__mocks__"],
      "editor": "cursor",
      "watch": false
    }

  Examples:
    npx @irisu25/arch-viz
    npx @irisu25/arch-viz ./src
    npx @irisu25/arch-viz ./src --ignore=tests,components
    npx @irisu25/arch-viz ./src --watch --editor=cursor
  `);
  process.exit(0);
}

let targetDir = '.';
// Track which options were explicitly set via CLI so we can correctly
// decide whether the config file value should be used instead.
let cliIgnores: string[] = [];
let cliWatchMode = false;
let cliEditor: string | undefined;

for (const arg of args) {
  if (arg.startsWith('--ignore=')) {
    cliIgnores = arg.substring(9).split(',').map(s => s.trim());
  } else if (arg === '--watch' || arg === '-w') {
    cliWatchMode = true;
  } else if (arg.startsWith('--editor=')) {
    cliEditor = arg.split('=')[1];
  } else if (!arg.startsWith('-')) {
    targetDir = arg;
  }
}

const absoluteTargetDir = path.resolve(process.cwd(), targetDir);

// Load config from the directory where the command is run (project root).
// CLI args always win — config is only used when the corresponding flag is absent.
const config = loadConfig(process.cwd());

const customIgnores = cliIgnores.length > 0 ? cliIgnores : (config.ignore ?? []);
const isWatchMode   = cliWatchMode || (config.watch ?? false);
const resolvedEditor = cliEditor ?? config.editor; // undefined = auto-detect from env

// Load path aliases from tsconfig.json / jsconfig.json once at startup.
const aliases = loadAliases(absoluteTargetDir);

const generatorOptions: GeneratorOptions = { editor: resolvedEditor };

function buildGraph(): string {
  console.log(`\nScanning: ${absoluteTargetDir}`);

  if (aliases) {
    const aliasCount = Object.keys(aliases.paths).length;
    const source = path.relative(absoluteTargetDir, aliases.baseUrl) || '.';
    if (aliasCount > 0) {
      console.log(`Path aliases: ${aliasCount} pattern${aliasCount === 1 ? '' : 's'} (baseUrl: ${source})`);
    } else {
      console.log(`Path aliases: baseUrl resolved to '${source}'`);
    }
  }

  if (customIgnores.length > 0) {
    console.log(`Ignoring folders: ${customIgnores.join(', ')}`);
  }
  
  const files = findTargetFiles(absoluteTargetDir, customIgnores);
  
  if (files.length === 0) {
    console.log('No supported code files found.');
    process.exit(0);
  }

  const dependencies = extractDependencies(files);
  
  const circularCount = detectCircularDependencies(dependencies, aliases);
  if (circularCount > 0) {
    console.log(`Found ${circularCount} circular dependenc${circularCount === 1 ? 'y' : 'ies'}.`);
  }

  detectOrphanFiles(dependencies);

  const outputPath = path.join(process.cwd(), 'arch-viz-output.html');
  generateHTML(dependencies, outputPath, aliases, generatorOptions);
  console.log(`Successfully generated graph for ${files.length} files.`);
  
  return outputPath;
}

try {
  const outputPath = buildGraph();

  if (isWatchMode) {
    startWatchServer(outputPath, absoluteTargetDir, buildGraph);
  } else {
    openInBrowser(outputPath);
  }
} catch (error: any) {
  console.error("Failed to generate visualization:", error.message);
  process.exit(1);
}
