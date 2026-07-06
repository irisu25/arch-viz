import * as fs from 'fs';
import * as path from 'path';
import { DependencyNode } from './extractor';
import { resolveImport } from './resolver';
import { PathAliases } from './aliases';

const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

/**
 * Generates a circular SVG icon for a node.
 * folderColor is used as a subtle outer ring to visually group files by folder.
 */
const getSvgIcon = (ext: string, folderColor: string = '#444C56', isNpm: boolean = false) => {
  if (isNpm) {
    const color = '#F47E3E';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="38" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.25"/>
      <circle cx="40" cy="40" r="30" fill="#0D1117" stroke="${color}" stroke-width="1.5"/>
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="12" letter-spacing="0.5" fill="${color}">NPM</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  let color = '#3B82F6';
  let label = 'TS';

  if (ext === '.tsx') {
    color = '#38BDF8';
    label = 'TSX';
  } else if (ext === '.jsx') {
    color = '#34D399';
    label = 'JSX';
  } else if (ext === '.js') {
    color = '#FBBF24';
    label = 'JS';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="38" fill="none" stroke="${folderColor}" stroke-width="1.5" stroke-opacity="0.35"/>
    <circle cx="40" cy="40" r="29" fill="#0D1117" stroke="${color}" stroke-width="2"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="13" letter-spacing="0.5" fill="${color}">${label}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

interface VisFont {
  color: string;
  face: string;
  size: number;
  vadjust: number;
}

interface VisNode {
  id: number;
  label: string;
  // title is intentionally omitted here — vis-network 9.x renders HTML string titles
  // as plain text (security change). We build DOM elements in the browser instead.
  sizeKb?: number;    // stored so the browser can build the tooltip
  isNpm?: boolean;    // stored so the browser knows the node type
  fullPath?: string;
  folderName?: string;
  folderColor?: string;
  shape: string;
  size: number;
  image: string;
  font: VisFont;
}

interface VisArrow {
  enabled: boolean;
  scaleFactor: number;
  type: string;
}

interface VisEdge {
  from: number | undefined;
  to: number | undefined;
  title: string;
  arrows: { to: VisArrow };
  color: { color: string; highlight: string; hover?: string };
  width: number;
  dashes?: boolean;
  smooth: { type: string; roundness: number };
}

export function generateHTML(
  nodes: DependencyNode[],
  outputPath: string,
  aliases?: PathAliases | null
) {
  const fileToId = new Map<string, number>();
  let currentId = 1;

  // Auto-detect editor from CLI arg or terminal environment
  const cliEditor = process.argv.find(a => a.startsWith('--editor='))?.split('=')[1];
  const envEditor = (cliEditor || process.env.TERM_PROGRAM || process.env.EDITOR || 'vscode').toLowerCase();
  let editorScheme = 'vscode://file/';
  if (envEditor.includes('cursor')) editorScheme = 'cursor://file/';
  else if (envEditor.includes('webstorm')) editorScheme = 'webstorm://open?file=';
  else if (envEditor.includes('idea')) editorScheme = 'idea://open?file=';
  else if (envEditor.includes('subl')) editorScheme = 'subl://open?url=file://';

  const visNodes: VisNode[] = nodes.map(node => {
    fileToId.set(node.filePath, currentId);

    const baseSize = 32;
    const scaledSize = Math.min(baseSize + (node.sizeKb * 0.3), 48);
    const ext = path.extname(node.filePath);

    const dir = path.dirname(node.filePath);
    const folderName = path.basename(dir);
    const fColor = folderName ? stringToColor(folderName) : '#444C56';

    return {
      id: currentId++,
      label: path.basename(node.filePath),
      sizeKb: node.sizeKb,
      fullPath: node.filePath,
      folderName: folderName,
      folderColor: fColor,
      shape: 'image',
      size: scaledSize,
      image: getSvgIcon(ext, fColor),
      font: {
        color: '#C9D1D9',
        face: 'Inter, sans-serif',
        size: 12,
        vadjust: 4
      }
    };
  });

  const visEdges: VisEdge[] = [];
  const externalPackages = new Map<string, number>();

  // Pre-build a Set of all known file paths for O(1) lookup during resolution.
  const allFileSet = new Set(nodes.map(n => n.filePath));

  nodes.forEach(node => {
    const fromId = fileToId.get(node.filePath);

    node.imports.forEach(imp => {
      const resolvedPath = resolveImport(node.filePath, imp, allFileSet, aliases);

      if (resolvedPath) {
        const toId = fileToId.get(resolvedPath);
        visEdges.push({
          from: fromId,
          to: toId,
          title: `<span style="color:#8B949E">import</span> '${imp}'`,
          arrows: { to: { enabled: true, scaleFactor: 0.5, type: 'arrow' } },
          color: { color: 'rgba(88, 166, 255, 0.2)', highlight: '#58A6FF', hover: '#58A6FF' },
          width: 1.5,
          smooth: { type: 'cubicBezier', roundness: 0.4 }
        });
      } else {
        // Not a relative path → treat as external NPM package,
        // but skip path aliases like '@/' which can't be resolved without tsconfig.
        if (!imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('@/')) {
          let extId = externalPackages.get(imp);
          if (!extId) {
            extId = currentId++;
            externalPackages.set(imp, extId);
            visNodes.push({
              id: extId,
              label: imp,
              isNpm: true,
              shape: 'image',
              size: 24,
              image: getSvgIcon('', '#F47E3E', true),
              font: {
                color: '#8B949E',
                face: 'Inter, sans-serif',
                size: 11,
                vadjust: 4
              }
            });
          }
          visEdges.push({
            from: fromId,
            to: extId,
            title: `import '${imp}'`,
            arrows: { to: { enabled: true, scaleFactor: 0.4, type: 'arrow' } },
            color: { color: 'rgba(244, 126, 62, 0.2)', highlight: '#F47E3E', hover: '#F47E3E' },
            width: 1,
            dashes: true,
            smooth: { type: 'cubicBezier', roundness: 0.4 }
          });
        }
      }
    });
  });

  const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Arch-Viz — Dependency Graph</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0; padding: 0;
      background-color: #080C12;
      color: #C9D1D9;
      font-family: 'Inter', sans-serif;
      overflow: hidden;
    }

    /* Dot-grid canvas background */
    #mynetwork {
      width: 100vw;
      height: 100vh;
      background-image: radial-gradient(circle, rgba(88, 166, 255, 0.06) 1px, transparent 1px);
      background-size: 28px 28px;
    }

    /* Custom scrollbar */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }

    /* Reusable glass card */
    .glass-card {
      background: rgba(10, 14, 20, 0.8);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 14px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.04);
    }

    /* Top-right controls */
    #controls-container {
      position: absolute;
      top: 20px; right: 20px;
      z-index: 10;
      display: flex;
      gap: 10px;
      align-items: center;
    }

    /* Export button */
    #export-btn {
      padding: 8px 15px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(10, 14, 20, 0.8);
      backdrop-filter: blur(20px);
      color: #8B949E;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 7px;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    #export-btn:hover {
      background: rgba(88, 166, 255, 0.1);
      border-color: rgba(88, 166, 255, 0.35);
      color: #58A6FF;
    }

    /* Search input */
    #search-input {
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(10, 14, 20, 0.8);
      backdrop-filter: blur(20px);
      color: #E6EDF3;
      width: 220px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      outline: none;
      transition: all 0.2s ease;
    }
    #search-input::placeholder { color: #484F58; }
    #search-input:focus {
      border-color: rgba(88, 166, 255, 0.45);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
    }

    /* Left: folder filter */
    #filter-container {
      position: absolute;
      top: 20px; left: 20px;
      z-index: 10;
      padding: 14px 16px;
      max-height: calc(100vh - 160px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 175px;
    }

    #filter-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    #filter-header h3 {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6E7681;
    }

    .filter-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;
      color: #8B949E;
      padding: 5px 6px;
      border-radius: 7px;
      transition: background 0.15s, color 0.15s;
      user-select: none;
    }
    .filter-item:hover { background: rgba(255,255,255,0.05); color: #C9D1D9; }
    .filter-checkbox {
      accent-color: #58A6FF;
      width: 14px; height: 14px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .folder-dot {
      width: 7px; height: 7px; border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .folder-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 115px;
    }

    /* Bottom-left: quick guide */
    #info-panel {
      position: absolute;
      bottom: 20px; left: 20px;
      z-index: 10;
      padding: 13px 16px;
      max-width: 220px;
      color: #6E7681;
      font-size: 12px;
      line-height: 1.8;
    }
    #info-panel .panel-title {
      display: flex; align-items: center; gap: 7px;
      color: #8B949E; font-weight: 600; font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 9px;
    }
    kbd {
      display: inline-block;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 5px;
      padding: 1px 6px;
      font-size: 11px;
      font-family: 'Inter', sans-serif;
      color: #C9D1D9;
      line-height: 1.6;
    }

    /* Bottom-right: stats */
    #stats-panel {
      position: absolute;
      bottom: 20px; right: 20px;
      z-index: 10;
      padding: 12px 20px;
      display: flex;
      gap: 18px;
      align-items: center;
    }
    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 600;
      color: #E6EDF3;
      line-height: 1;
    }
    .stat-label {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6E7681;
    }
    .stat-divider {
      width: 1px; height: 26px;
      background: rgba(255,255,255,0.07);
    }

    /* Loading overlay */
    #loading-overlay {
      position: fixed;
      inset: 0;
      background: #080C12;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 100;
      transition: opacity 0.5s ease;
    }
    #loading-overlay.hidden { opacity: 0; pointer-events: none; }

    .loading-spinner {
      width: 32px; height: 32px;
      border: 2px solid rgba(88, 166, 255, 0.12);
      border-top-color: #58A6FF;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text {
      font-size: 12px;
      color: #6E7681;
      letter-spacing: 0.06em;
    }

    /* vis.js tooltip override
       vis-network adds white-space:nowrap internally — we must override it
       or the text will overflow the box on a single line. */
    .vis-tooltip {
      background: rgba(10, 14, 20, 0.97) !important;
      border: 1px solid rgba(255,255,255,0.09) !important;
      border-radius: 10px !important;
      color: #C9D1D9 !important;
      font-family: 'Inter', sans-serif !important;
      font-size: 12px !important;
      padding: 12px 16px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
      line-height: 1.65 !important;
      white-space: normal !important;
      word-break: break-word !important;
      width: max-content !important;
      max-width: 300px !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body>

  <div id="loading-overlay">
    <div class="loading-spinner"></div>
    <div class="loading-text">Building graph…</div>
  </div>

  <div id="controls-container">
    <button id="export-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Export PNG
    </button>
    <input type="text" id="search-input" placeholder="Search file or package…" autocomplete="off">
  </div>

  <div id="filter-container" class="glass-card">
    <div id="filter-header">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#58A6FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      <h3>Folders</h3>
    </div>
  </div>

  <div id="info-panel" class="glass-card">
    <div class="panel-title">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#58A6FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      Controls
    </div>
    <kbd>Click</kbd> — focus dependencies<br>
    <kbd>Dbl-click</kbd> — open in editor<br>
    <kbd>Scroll</kbd> / <kbd>Drag</kbd> — navigate<br>
    <kbd>↑↓←→</kbd> — pan view
  </div>

  <div id="stats-panel" class="glass-card">
    <div class="stat-item">
      <span class="stat-value" id="stat-files">—</span>
      <span class="stat-label">Files</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item">
      <span class="stat-value" id="stat-pkgs">—</span>
      <span class="stat-label">Packages</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item">
      <span class="stat-value" id="stat-edges">—</span>
      <span class="stat-label">Imports</span>
    </div>
  </div>

  <div id="mynetwork"></div>

  <script type="text/javascript">
    var rawNodes = ${JSON.stringify(visNodes)};
    var rawEdges = ${JSON.stringify(visEdges)};
    var editorName = '${envEditor}';

    // Populate stats
    document.getElementById('stat-files').textContent  = rawNodes.filter(function(n) { return !!n.fullPath; }).length;
    document.getElementById('stat-pkgs').textContent   = rawNodes.filter(function(n) { return !n.fullPath; }).length;
    document.getElementById('stat-edges').textContent  = rawEdges.length;

    // Build tooltip DOM elements.
    // vis-network 9.x no longer renders HTML strings as tooltips (security change).
    // We must pass actual HTMLElement objects instead.
    rawNodes = rawNodes.map(function(n) {
      var div = document.createElement('div');
      div.style.cssText = 'font-size:12px;line-height:1.7;width:240px;';
      if (n.fullPath) {
        div.innerHTML =
          '<div style="font-weight:600;color:#E6EDF3;margin-bottom:5px">' + n.label + '</div>' +
          '<div style="color:#6E7681;font-size:11px;word-break:break-all;margin-bottom:8px">' + n.fullPath + '</div>' +
          '<div style="color:#8B949E">Size: ' + n.sizeKb + ' KB</div>' +
          '<div style="color:#484F58;margin-top:8px;font-style:italic">Double-click to open in ' + editorName + '</div>';
      } else {
        div.innerHTML =
          '<div style="font-weight:600;color:#E6EDF3;margin-bottom:5px">' + n.label + '</div>' +
          '<div style="color:#6E7681;font-size:11px">External NPM Package</div>';
      }
      n.title = div;
      return n;
    });

    var nodes = new vis.DataSet(rawNodes);
    var edges = new vis.DataSet(rawEdges);

    var container = document.getElementById('mynetwork');
    var data = { nodes: nodes, edges: edges };

    var options = {
      interaction: {
        hover: true,
        tooltipDelay: 200,
        selectConnectedEdges: true,
        keyboard: { enabled: true, speed: { x: 10, y: 10, zoom: 0.02 } },
        zoomSpeed: 0.5
      },
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'LR',
          sortMethod: 'directed',
          nodeSpacing: 90,
          levelSeparation: 260,
          treeSpacing: 160,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true
        }
      },
      physics: {
        hierarchicalRepulsion: {
          nodeDistance: 110,
          springConstant: 0.01,
          damping: 0.9,
          avoidOverlap: 0.5
        },
        stabilization: {
          iterations: 150
        }
      },
      nodes: {
        shadow: {
          enabled: true,
          color: 'rgba(0, 0, 0, 0.45)',
          size: 10,
          x: 0, y: 4
        }
      }
    };

    var network = new vis.Network(container, data, options);

    // Hide loading overlay once physics settles
    network.on('stabilizationIterationsDone', function() {
      network.setOptions({ physics: { enabled: false } });
      var overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 600);
      }
    });

    // --- Folder filter ---
    var filterState = {};
    var filterContainer = document.getElementById('filter-container');

    var folders = new Map();
    rawNodes.forEach(function(n) {
      var name = n.folderName || 'External NPM';
      var color = n.folderColor || '#F47E3E';
      if (!folders.has(name)) {
        folders.set(name, color);
        filterState[name] = true;
      }
    });

    var sortedFolders = Array.from(folders.keys()).sort(function(a, b) {
      if (a === 'External NPM') return 1;
      if (b === 'External NPM') return -1;
      return a.localeCompare(b);
    });

    sortedFolders.forEach(function(name) {
      var color = folders.get(name);
      var lbl = document.createElement('label');
      lbl.className = 'filter-item';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'filter-checkbox';
      cb.checked = true;
      cb.onchange = function(e) {
        filterState[name] = e.target.checked;
        applyFilters();
      };

      var dot = document.createElement('span');
      dot.className = 'folder-dot';
      dot.style.backgroundColor = color;

      var text = document.createElement('span');
      text.className = 'folder-label';
      text.title = name;
      text.textContent = name;

      lbl.appendChild(cb);
      lbl.appendChild(dot);
      lbl.appendChild(text);
      filterContainer.appendChild(lbl);
    });

    function applyFilters() {
      nodes.update(rawNodes.map(function(n) {
        var name = n.folderName || 'External NPM';
        return { id: n.id, hidden: !filterState[name] };
      }));
    }

    // --- Focus mode ---
    network.on('selectNode', function(params) {
      if (params.nodes.length !== 1) return;
      var selectedId = params.nodes[0];
      var connected = network.getConnectedNodes(selectedId);

      nodes.update(rawNodes.map(function(n) {
        var isRelevant = n.id === selectedId || connected.includes(n.id);
        return { id: n.id, opacity: isRelevant ? 1 : 0.1 };
      }));
    });

    network.on('deselectNode', function() {
      nodes.update(rawNodes.map(function(n) { return { id: n.id, opacity: 1 }; }));
    });

    // --- Search ---
    document.getElementById('search-input').addEventListener('input', function(e) {
      var term = e.target.value.toLowerCase().trim();

      if (!term) {
        nodes.update(rawNodes.map(function(n) { return { id: n.id, opacity: 1 }; }));
        return;
      }

      var firstMatch = null;
      nodes.update(rawNodes.map(function(n) {
        var match = n.label.toLowerCase().includes(term);
        if (match && !firstMatch) firstMatch = n.id;
        return { id: n.id, opacity: match ? 1 : 0.1 };
      }));

      if (firstMatch) {
        network.focus(firstMatch, {
          scale: 1.6,
          animation: { duration: 450, easingFunction: 'easeInOutQuad' }
        });
      }
    });

    // --- Double-click to open in editor ---
    network.on('doubleClick', function(params) {
      if (params.nodes.length !== 1) return;
      var nodeData = nodes.get(params.nodes[0]);
      if (nodeData && nodeData.fullPath) {
        var scheme = '${editorScheme}';
        var filePath = nodeData.fullPath.replace(/\\\\/g, '/');
        window.open(scheme + filePath, '_self');
      }
    });

    // --- Export PNG ---
    document.getElementById('export-btn').addEventListener('click', function() {
      var canvas = container.querySelector('canvas');
      if (!canvas) return;

      var temp = document.createElement('canvas');
      temp.width = canvas.width;
      temp.height = canvas.height;
      var ctx = temp.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#080C12';
      ctx.fillRect(0, 0, temp.width, temp.height);
      ctx.drawImage(canvas, 0, 0);

      var link = document.createElement('a');
      link.download = 'architecture-map.png';
      link.href = temp.toDataURL('image/png');
      link.click();
    });

    // --- Live reload (watch mode) ---
    if (window.location.protocol.startsWith('http')) {
      var source = new EventSource('/stream');
      source.onmessage = function(e) {
        if (e.data === 'reload') location.reload();
      };
    }
  </script>
</body>
</html>
`;

  fs.writeFileSync(outputPath, htmlTemplate, 'utf-8');
  return outputPath;
}
