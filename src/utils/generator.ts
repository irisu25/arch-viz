import * as fs from 'fs';
import * as path from 'path';
import { DependencyNode } from './extractor';
import { resolveImport } from './resolver';

const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const getSvgIcon = (ext: string, isNpm: boolean = false) => {
  if (isNpm) {
    const color = '#cb3837';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
      <rect width="60" height="60" rx="12" fill="#1C2128" stroke="${color}" stroke-width="2"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="14" fill="${color}">NPM</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  let color = '#3178C6';
  let label = 'TS';

  if (ext === '.jsx' || ext === '.tsx') {
    color = '#61DAFB';
    label = 'React';
  } else if (ext === '.js') {
    color = '#F7DF1E';
    label = 'JS';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <rect width="60" height="60" rx="12" fill="#1C2128" stroke="${color}" stroke-width="2"/>
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="16" fill="${color}">${label}</text>
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
  title: string;
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

export function generateHTML(nodes: DependencyNode[], outputPath: string) {
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
    
    const baseSize = 60;
    const scaledSize = Math.min(baseSize + (node.sizeKb * 0.5), 90);
    const ext = path.extname(node.filePath);
    
    const dir = path.dirname(node.filePath);
    const folderName = path.basename(dir);
    const fColor = folderName ? stringToColor(folderName) : '#444C56';
    
    return {
      id: currentId++,
      label: path.basename(node.filePath),
      title: `Path: ${node.filePath}<br>Size: ${node.sizeKb} KB<br><br><i>Double-click to open in ${envEditor}</i>`,
      fullPath: node.filePath,
      folderName: folderName,
      folderColor: fColor,
      shape: 'image',
      size: scaledSize / 2,
      image: getSvgIcon(ext),
      font: { 
        color: '#C9D1D9', 
        face: 'Inter, sans-serif',
        size: 14,
        vadjust: 5
      }
    };
  });

  const visEdges: VisEdge[] = [];
  const externalPackages = new Map<string, number>();

  // Pre-build a Set of all known file paths for O(1) lookup during resolution.
  // This replaces the old nodes.find(n => n.filePath.includes(basename)) pattern
  // which was unreliable: it matched any file whose path string happened to
  // contain the import's basename (e.g. 'scanner' matching 'scanner.ts' AND
  // 'default-scanner.ts'), and always picked the first match regardless of context.
  const allFileSet = new Set(nodes.map(n => n.filePath));

  nodes.forEach(node => {
    const fromId = fileToId.get(node.filePath);

    node.imports.forEach(imp => {
      const resolvedPath = resolveImport(node.filePath, imp, allFileSet);

      if (resolvedPath) {
        const toId = fileToId.get(resolvedPath);
        visEdges.push({
          from: fromId,
          to: toId,
          title: `import '${imp}'`,
          arrows: { to: { enabled: true, scaleFactor: 0.6, type: 'arrow' } },
          color: { color: '#444C56', highlight: '#FFD700', hover: '#FFD700' },
          width: 2,
          smooth: { type: 'cubicBezier', roundness: 0.5 }
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
              title: `External NPM Package: ${imp}`,
              shape: 'image',
              size: 30,
              image: getSvgIcon('', true),
              font: { 
                color: '#C9D1D9', 
                face: 'Inter, sans-serif',
                size: 14,
                vadjust: 5
              }
            });
          }
          visEdges.push({
            from: fromId,
            to: extId,
            title: `import '${imp}'`,
            arrows: { to: { enabled: true, scaleFactor: 0.4, type: 'arrow' } },
            color: { color: 'rgba(203, 56, 55, 0.4)', highlight: '#FFD700' },
            width: 1,
            dashes: true,
            smooth: { type: 'cubicBezier', roundness: 0.5 }
          });
        }
      }
    });
  });

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Arch-Viz Interactive Graph</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    body { 
      margin: 0; padding: 0; 
      background-color: #0D1117; 
      color: #C9D1D9; 
      font-family: 'Inter', sans-serif; 
      overflow: hidden;
    }
    #mynetwork { width: 100vw; height: 100vh; }
    
    #controls-container {
      position: absolute;
      top: 24px; right: 24px;
      z-index: 10;
      display: flex;
      gap: 12px;
    }
    #filter-container {
      position: absolute;
      top: 24px; left: 24px;
      z-index: 10;
      background: rgba(22, 27, 34, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 16px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      max-height: 60vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #filter-container h3 { margin: 0 0 10px 0; font-size: 14px; color: #FFFFFF; font-weight: 600; }
    .filter-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;
      color: #C9D1D9;
      transition: color 0.2s;
    }
    .filter-item:hover { color: #FFFFFF; }
    .filter-checkbox {
      accent-color: #58A6FF;
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    .folder-dot {
      width: 12px; height: 12px; border-radius: 50%;
      display: inline-block;
    }
    #info-panel {
      position: absolute;
      bottom: 24px; left: 24px;
      z-index: 10;
      background: rgba(22, 27, 34, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 16px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      max-width: 250px;
      color: #8B949E;
      font-size: 12px;
      line-height: 1.6;
    }
    #info-panel b { color: #C9D1D9; }
    #info-panel .title {
      display: flex; align-items: center; gap: 8px;
      color: #FFFFFF; font-weight: 600; font-size: 13px;
      margin-bottom: 8px;
    }
    #export-btn {
      padding: 12px 20px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(22, 27, 34, 0.7);
      backdrop-filter: blur(12px);
      color: white;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
    }
    #export-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    #search-input {
      padding: 12px 20px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(22, 27, 34, 0.7);
      backdrop-filter: blur(12px);
      color: white;
      width: 250px;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      outline: none;
      transition: all 0.3s ease;
    }
    #search-input:focus {
      border-color: #58A6FF;
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.3);
    }
  </style>
</head>
<body>
  <div id="controls-container">
    <button id="export-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      Export
    </button>
    <input type="text" id="search-input" placeholder="Search file or package..." autocomplete="off">
  </div>

  <div id="filter-container">
    <h3>Filter Folders</h3>
  </div>

  <div id="info-panel">
    <div class="title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58A6FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
      Quick Guide
    </div>
    • <b>Click</b> a file to highlight dependencies.<br>
    • <b>Double-click</b> to open in Editor.<br>
    • <b>Scroll/Drag</b> to navigate the map.
  </div>

  <div id="mynetwork"></div>

  <script type="text/javascript">
    var rawNodes = ${JSON.stringify(visNodes)};
    var rawEdges = ${JSON.stringify(visEdges)};
    
    var nodes = new vis.DataSet(rawNodes);
    var edges = new vis.DataSet(rawEdges);

    var container = document.getElementById('mynetwork');
    var data = { nodes: nodes, edges: edges };
    var options = {
      interaction: {
        hover: true,
        tooltipDelay: 100,
        selectConnectedEdges: true
      },
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'LR',
          sortMethod: 'directed',
          nodeSpacing: 100,
          levelSeparation: 300
        }
      },
      physics: {
        hierarchicalRepulsion: {
          nodeDistance: 150,
          springConstant: 0.01,
          damping: 0.9
        },
        stabilization: {
          iterations: 100
        }
      }
    };
    
    var network = new vis.Network(container, data, options);

    // --- Interactive Filtering Logic ---
    var filterState = {};
    var filterContainer = document.getElementById('filter-container');
    
    var folders = new Map();
    rawNodes.forEach(function(n) {
      var name = n.folderName || 'External NPM';
      var color = n.folderColor || '#cb3837';
      if (!folders.has(name)) {
        folders.set(name, color);
        filterState[name] = true;
      }
    });

    // Urutkan nama folder agar External NPM selalu di bawah
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
      
      var text = document.createTextNode(name);
      
      lbl.appendChild(cb);
      lbl.appendChild(dot);
      lbl.appendChild(text);
      filterContainer.appendChild(lbl);
    });

    function applyFilters() {
      var updateNodes = rawNodes.map(function(n) {
        var name = n.folderName || 'External NPM';
        var isVisible = filterState[name];
        return { id: n.id, hidden: !isVisible };
      });
      nodes.update(updateNodes);
    }
    // ------------------------------------

    network.on("selectNode", function (params) {
      if (params.nodes.length == 1) {
        var selectedNodeId = params.nodes[0];
        var connectedNodes = network.getConnectedNodes(selectedNodeId);
        
        var updateNodes = rawNodes.map(function(n) {
          if (n.id === selectedNodeId || connectedNodes.includes(n.id)) {
            return { id: n.id, opacity: 1 };
          }
          return { id: n.id, opacity: 0.15 };
        });
        nodes.update(updateNodes);
      }
    });

    network.on("deselectNode", function () {
      nodes.update(rawNodes.map(function(n) {
        return { id: n.id, opacity: 1 };
      }));
    });

    document.getElementById('search-input').addEventListener('input', function(e) {
      var term = e.target.value.toLowerCase().trim();
      
      if (!term) {
        nodes.update(rawNodes.map(function(n) { return { id: n.id, opacity: 1 }; }));
        return;
      }
      
      var matchNodeId = null;
      var updateNodes = rawNodes.map(function(n) {
        if (n.label.toLowerCase().includes(term)) {
           if (!matchNodeId) matchNodeId = n.id;
           return { id: n.id, opacity: 1 };
        }
        return { id: n.id, opacity: 0.15 };
      });
      
      nodes.update(updateNodes);
      
      if (matchNodeId) {
         network.focus(matchNodeId, { scale: 1.2, animation: true });
      }
    });

    network.on("doubleClick", function (params) {
      if (params.nodes.length == 1) {
        var clickedNodeId = params.nodes[0];
        var nodeData = nodes.get(clickedNodeId);
        if (nodeData && nodeData.fullPath) {
          var scheme = '${editorScheme}';
          var filePath = nodeData.fullPath.replace(/\\\\/g, '/');
          window.open(scheme + filePath, '_self');
        }
      }
    });

    document.getElementById('export-btn').addEventListener('click', function() {
      var canvas = container.querySelector('canvas');
      if (!canvas) return;

      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      var ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#0D1117';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      ctx.drawImage(canvas, 0, 0);

      var link = document.createElement('a');
      link.download = 'architecture-map.png';
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    });

    if (window.location.protocol.startsWith('http')) {
      var source = new EventSource('/stream');
      source.onmessage = function(e) {
        if (e.data === 'reload') {
          console.log('Change detected, reloading graph...');
          location.reload();
        }
      };
    }
  </script>
</body>
</html>
  `;

  fs.writeFileSync(outputPath, htmlTemplate, 'utf-8');
  return outputPath;
}
