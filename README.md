# Arch-Viz

**Zero-config, interactive architecture visualization for JavaScript and TypeScript projects.**

Arch-Viz is a lightweight CLI tool that instantly maps out your codebase. It statically analyzes your `import` and `require` statements to generate a beautiful, interactive dependency graph right in your browser.

## Features

- **Zero Configuration**: Works out of the box. No webpack plugins, no Babel configs required.
- **Interactive Graph**: Pan, zoom, and drag nodes. Powered by Vis.js with a smart physics engine.
- **Interactive Filtering**: Domain-based filtering! Use the sidebar checkboxes to show/hide specific folders or hide External NPM Packages to declutter your view.
- **Focus Mode**: Click on any file to instantly highlight its direct dependencies and dim the rest of the noise.
- **IDE Integration**: Double-click any node in the browser to instantly open that exact file in your preferred editor (VSCode, Cursor, WebStorm, etc.)!
- **External NPM Detection**: Maps out your 3rd-party dependencies (React, Lodash, etc.) and isolates them dynamically.
- **Dead Code Detection**: Automatically spots orphaned files that are never imported anywhere.
- **Custom Ignore**: Use `--ignore=folder1,folder2` to skip heavy or irrelevant directories.
- **Live Reload**: Run with `--watch` to automatically rebuild the graph in your browser as you type code.
- **Sleek UI**: Premium GitHub Dark Dimmed theme with Glassmorphism overlay, circular nodes, hierarchical layout, intuitive Info Panels, and native SVG icons.
- **Path Alias Resolution**: Automatically resolves path aliases defined in `tsconfig.json` or `jsconfig.json`.
- **Circular Dependency Detection**: Automatically detects and warns you about circular dependencies in your codebase.
- **Config File Support**: Define your CLI options in an `.arch-viz.json` file.

## Quick Start

You don't even need to install it globally! You can run it directly using `npx` on any existing project:

```bash
# Run in your current directory
npx @irisu25/arch-viz

# Target a specific folder
npx @irisu25/arch-viz ./src

# Exclude specific folders like tests or components
npx @irisu25/arch-viz ./src --ignore=tests,components

# Specify an IDE manually if running from a non-IDE terminal (e.g., cursor, webstorm, idea, subl)
npx @irisu25/arch-viz ./src --editor=cursor

# Watch mode: auto-rebuilds graph on file changes (Live Reload)
npx @irisu25/arch-viz ./src --watch
```

### Manual Installation

If you prefer to clone and run it locally:

```bash
git clone https://github.com/irisu25/arch-viz.git
cd arch-viz
npm install
npm run build

# Link the package globally
npm link

# Now you can use it anywhere!
arch-viz ./src
```

### Configuration File

To avoid repeating flags, you can create an `.arch-viz.json` file in your project root. CLI arguments will always override the config file values.

```json
{
  "ignore": ["tests", "stories", "__mocks__"],
  "editor": "cursor",
  "watch": false
}
```

## How It Works

1. **Scanner**: Recursively searches the target directory for supported code files.
2. **Extractor**: Uses regex pattern matching to extract all ES6 `import` and CommonJS `require()` dependencies.
3. **Generator**: Compiles the data into a static, self-contained HTML file (`arch-viz-output.html`) injected with vis-network data.
4. **Auto-Open**: Automatically launches your default web browser to display the graph.

## License

MIT License.
