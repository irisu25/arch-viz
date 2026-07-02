import * as fs from 'fs';
import * as path from 'path';
import { DependencyNode } from './extractor';

export function generateHTML(nodes: DependencyNode[], outputPath: string) {
  // Kita buat pemetaan (map) dari filepath ke ID unik berupa angka
  const fileToId = new Map<string, number>();
  let currentId = 1;

  // 1. Siapkan struktur Nodes untuk Vis.js
  const visNodes = nodes.map(node => {
    fileToId.set(node.filePath, currentId);
    
    // Gunakan nama file sebagai label di grafik
    const label = path.basename(node.filePath);
    
    return {
      id: currentId++,
      label: label,
      title: node.filePath, // Tulisan saat di-hover (tooltip)
      shape: 'box',
      color: {
        background: '#2B2B2B',
        border: '#5B5B5B',
        highlight: { background: '#4A90E2', border: '#2C3E50' }
      },
      font: { color: 'white' }
    };
  });

  // 2. Siapkan struktur Edges (Garis penghubung)
  const visEdges: any[] = [];
  
  nodes.forEach(node => {
    const fromId = fileToId.get(node.filePath);
    
    node.imports.forEach(imp => {
      // Dalam MVP, kita melakukan pencocokan sederhana:
      // Cari apakah ada file yang namanya mengandung path import ini.
      // (Bisa dikembangkan jadi lebih akurat nanti)
      const targetFileName = path.basename(imp);
      const targetNode = nodes.find(n => n.filePath.includes(targetFileName));
      
      if (targetNode) {
        const toId = fileToId.get(targetNode.filePath);
        visEdges.push({
          from: fromId,
          to: toId,
          arrows: 'to',
          color: '#888888'
        });
      }
    });
  });

  // 3. Gabungkan jadi HTML
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Architecture Visualization</title>
  <!-- Load Vis.js dari CDN -->
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    body { margin: 0; padding: 0; background-color: #1E1E1E; color: white; font-family: sans-serif; }
    #mynetwork { width: 100vw; height: 100vh; }
    #title { position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 8px; }
  </style>
</head>
<body>
  <div id="title">
    <h2>Project Architecture</h2>
    <p>Zoom and drag to explore. Hover to see full path.</p>
  </div>
  <div id="mynetwork"></div>

  <script type="text/javascript">
    // Data dari CLI disuntikkan ke sini
    var nodes = new vis.DataSet(${JSON.stringify(visNodes)});
    var edges = new vis.DataSet(${JSON.stringify(visEdges)});

    var container = document.getElementById('mynetwork');
    var data = { nodes: nodes, edges: edges };
    var options = {
      physics: {
        stabilization: false,
        barnesHut: { gravitationalConstant: -3000 }
      },
      layout: { improvedLayout: true }
    };
    var network = new vis.Network(container, data, options);
  </script>
</body>
</html>
  `;

  // Tulis hasilnya ke file
  fs.writeFileSync(outputPath, htmlTemplate, 'utf-8');
  return outputPath;
}
