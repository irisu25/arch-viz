import * as fs from 'fs';
import * as path from 'path';
import { DependencyNode } from './extractor';

const getSvgIcon = (ext: string) => {
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

  const visNodes = nodes.map(node => {
    fileToId.set(node.filePath, currentId);
    
    // Scale SVG slightly based on file size (cap at 80x80)
    const baseSize = 60;
    const scaledSize = Math.min(baseSize + (node.sizeKb * 0.5), 90);
    const ext = path.extname(node.filePath);
    
    return {
      id: currentId++,
      label: path.basename(node.filePath),
      title: `Path: ${node.filePath}<br>Size: ${node.sizeKb} KB`,
      shape: 'image',
      size: scaledSize / 2, // vis.js uses radius for size
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
          arrows: {
            to: { enabled: true, scaleFactor: 0.6, type: 'arrow' }
          },
          color: { color: '#444C56', highlight: '#FFD700', hover: '#FFD700' },
          width: 2,
          smooth: { type: 'cubicBezier', roundness: 0.5 }
        });
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
    <p><b>Click a node</b> to highlight connections. <br><br>Edges indicate module imports.</p>
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
  </script>
</body>
</html>
  `;

  fs.writeFileSync(outputPath, htmlTemplate, 'utf-8');
  return outputPath;
}
