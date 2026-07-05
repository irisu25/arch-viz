import * as fs from 'fs';
import * as path from 'path';
import { DependencyNode } from './extractor';

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

export function generateHTML(nodes: DependencyNode[], outputPath: string) {
  const fileToId = new Map<string, number>();
  let currentId = 1;

  const visNodes: any[] = nodes.map(node => {
    fileToId.set(node.filePath, currentId);
    
    const baseSize = 60;
    const scaledSize = Math.min(baseSize + (node.sizeKb * 0.5), 90);
    const ext = path.extname(node.filePath);
    
    return {
      id: currentId++,
      label: path.basename(node.filePath),
      title: `Path: ${node.filePath}<br>Size: ${node.sizeKb} KB<br><br><i>Double-click to open in VSCode</i>`,
      fullPath: node.filePath,
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

  const visEdges: any[] = [];
  const externalPackages = new Map<string, number>();
  
  nodes.forEach(node => {
    const fromId = fileToId.get(node.filePath);
    
    node.imports.forEach(imp => {
      const targetFileName = path.basename(imp);
      const targetNode = nodes.find(n => n.filePath.includes(targetFileName));
      
      if (targetNode) {
        const toId = fileToId.get(targetNode.filePath);
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
    
    #title { 
      position: absolute; 
      top: 24px; left: 24px; 
      z-index: 10; 
      background: rgba(22, 27, 34, 0.7); 
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 20px 24px; 
      border-radius: 16px; 
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      max-width: 320px;
    }
    #title h2 { margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #FFFFFF; }
    #title p { margin: 0; font-size: 13px; color: #8B949E; line-height: 1.5; }
    .icon-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }

    #controls-container {
      position: absolute;
      top: 24px; right: 24px;
      z-index: 10;
      display: flex;
      gap: 12px;
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
  <div id="title">
    <div class="icon-header">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"></path>
      </svg>
      <h2>Architecture Map</h2>
    </div>
    <p><b>Click a node</b> to highlight connections.<br><br><b>Red boxes</b> are external NPM packages.</p>
  </div>
  
  <div id="controls-container">
    <button id="export-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      Export
    </button>
    <input type="text" id="search-input" placeholder="Search file or package..." autocomplete="off">
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
          nodeDistance: 150
        }
      }
    };
    
    var network = new vis.Network(container, data, options);

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
          var vscodeUrl = 'vscode://file/' + nodeData.fullPath.replace(/\\\\/g, '/');
          window.open(vscodeUrl, '_self');
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
