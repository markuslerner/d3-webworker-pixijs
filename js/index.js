// Based on:
// https://bl.ocks.org/kirjavascript/dcafa2b3a53cbcc9c5de19b938b92119
// https://observablehq.com/@zakjan/force-directed-graph-pixi

import Stats from 'https://unpkg.com/stats.js@0.17.0/src/Stats.js';

import {GUI} from 'https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js';

import SmoothFollow from './SmoothFollow.js';

import { createRandomGraph, hyper, multiply } from './graph-utils.js';



const FORCE_LAYOUT_NODE_REPULSION_STRENGTH = 20;
const FORCE_LAYOUT_ITERATIONS = 1;
const NODE_RADIUS = 5;
const NODE_HIT_WIDTH = 5;
const NODE_HIT_RADIUS = NODE_RADIUS + NODE_HIT_WIDTH;
const ALPHA = 0.25;
const ALPHA_DECAY = 0.005;
const ALPHA_TARGET = 0.05;

const params = {
  useWebWorker: true,
  interpolatePositions: true,
  drawLines: false,
  numNodes: 2000,
  numLinks: 4000,
};

let gfxIDMap = {}; // store references to node graphics by node id
let gfxMap = new WeakMap(); // store references to node graphics by node
let nodeMap = new WeakMap(); // store references to nodes by node graphics

let graph;
let simulation; // simulation when not using web worker
let worker; // web worker
let sendTime; // Time when we sent last message
let delta = 1 / 60;
let width = window.innerWidth;
let height = window.innerHeight;
let nodesBuffer;
let draggingNode;
let workerStats;

// var node = document.createElement("div");
// node.appendChild( document.createTextNode("Water") );

const renderStats = new Stats();
document.body.appendChild(renderStats.dom);
var title = document.createElement("div");
title.className = 'title';
title.appendChild(document.createTextNode("Renderer"));
renderStats.dom.insertBefore(title, renderStats.dom.childNodes[0]);
renderStats.dom.style.left = '0px';
renderStats.dom.style.right = 'auto';
renderStats.dom.style.top = 'auto';
renderStats.dom.style.bottom = '0px';

workerStats = new Stats();
document.body.appendChild( workerStats.dom );
var title = document.createElement("div");
title.appendChild(document.createTextNode("Worker"));
title.className = 'title';
workerStats.dom.insertBefore(title, workerStats.dom.childNodes[0]);
workerStats.dom.style.left = 'auto';
workerStats.dom.style.right = '0px';
workerStats.dom.style.top = 'auto';
workerStats.dom.style.bottom = '0px';
workerStats.dom.style.display = params.useWebWorker ? 'block' : 'none';

const gui = new GUI();
// gui.close();

gui.add(params, 'numNodes', 1, 10000).name('num nodes').onChange(updateNodesAndLinks);
gui.add(params, 'numLinks', 1, 10000).name('num links').onChange(updateNodesAndLinks);
gui.add(params, 'useWebWorker').name('use WebWorker').onChange(function() {
  if(params.useWebWorker) {
    updateNodesFromBuffer();
    simulation.stop();
  } else {
    simulation.restart();
  }
  workerStats.dom.style.display = params.useWebWorker ? 'block' : 'none';
});
gui.add(params, 'interpolatePositions').name('interpolate');
gui.add(params, 'drawLines').name('draw lines');

const app = new PIXI.Application({
  width,
  height,
  antialias: true,
  backgroundColor: 0x000000,
  resolution: window.devicePixelRatio || 1,
  autoStart: true,
  autoDensity: true,
});
document.body.appendChild(app.view);

window.addEventListener("resize", function() {
  width = window.innerWidth;
  height = window.innerHeight;
  app.renderer.resize(width, height);
  updateMainThreadSimulation();
});

const container = new PIXI.Container();
app.stage.addChild(container);

const linksGfx = new PIXI.Graphics();
linksGfx.alpha = 0.6;
container.addChild(linksGfx);

app.ticker.add(() => {
  renderStats.end();
  renderStats.begin();
});

app.ticker.add(updateInterpolatedPositions);

app.ticker.add(drawLines);

const colour = (function() {
    const scale = d3.scaleOrdinal(d3.schemeCategory10);
    return (num) => parseInt(scale(num).slice(1), 16);
})();

// d3.json("https://gist.githubusercontent.com/mbostock/4062045/raw/5916d145c8c048a6e3086915a6be464467391c62/miserables.json")
// .then(json => {
//     graph = JSON.parse(JSON.stringify(json));
//
//     console.log('Original graph: ' + graph.nodes.length + ' nodes, ' + graph.links.length + ' links');
//     console.log(graph);
//
//     const h = 5;
//     const m = 1;
//     graph = hyper(multiply(graph, m), h);
//     console.log('multiply: ' + m + ', hyper: ' + h);
//     console.log(graph.nodes.length + ' nodes, ' + graph.links.length + ' links');
//
//     createPixiGraphics();
//
//     createWebworker();
//
//     createMainThreadSimulation();
//
// });



init();

function init() {
  createGraph();

  createPixiGraphics();

  createWebworker();

  createMainThreadSimulation();

}

function updateNodesAndLinks() {
  graph.nodes.forEach(node => {
    const gfx = gfxIDMap[node.id];
    container.removeChild(gfx);
    gfx.destroy();
  });
  gfxIDMap = [];
  gfxMap = new WeakMap();
  nodeMap = new WeakMap();

  createGraph();

  createPixiGraphics();

  nodesBuffer = new Float32Array(graph.nodes.length * 2);

  updateWorkerGraph();

  simulation.nodes(graph.nodes);
  simulation.force("link", d3.forceLink(graph.links).id(d => d.id));

}

function createGraph() {
  graph = createRandomGraph(params.numNodes, params.numLinks);
}

function createPixiGraphics() {
  graph.nodes.forEach((node) => {
    const gfx = new PIXI.Graphics();
    gfx.lineStyle(1.5, 0xFFFFFF);
    gfx.beginFill(colour(node.group));
    gfx.drawCircle(0, 0, NODE_RADIUS);
    gfx.interactive = true;
    gfx.buttonMode = true;
    gfx.dragging = false;
    gfx.hitArea = new PIXI.Circle(0, 0, NODE_HIT_RADIUS);
    gfx.on('pointerdown', onDragStart);
    gfx.on('pointerup', onDragEnd);
    gfx.on('pointerupoutside', onDragEnd);
    gfx.on('pointermove', onDragMove);
    gfx.smoothFollowX = new SmoothFollow();
    gfx.smoothFollowY = new SmoothFollow();

    container.addChild(gfx);
    gfxIDMap[node.id] = gfx;
    gfxMap.set(node, gfx);
    nodeMap.set(gfx, node);
  });
}

function createWebworker() {
  // console.log('Create web worker');

  nodesBuffer = new Float32Array(graph.nodes.length * 2);
  // nodesBuffer = new Float32Array(new SharedArrayBuffer(graph.nodes.length * 2 * 4));

  const workerCode = `
    importScripts('https://unpkg.com/d3@5.12.0/dist/d3.min.js');

    let simulation;
    let graph;

    function copyDataToBuffers(nodesBuffer) {
      // Copy over the data to the buffers
      for(var i = 0; i < graph.nodes.length; i++){
          var node = graph.nodes[i];
          nodesBuffer[i * 2 + 0] = node.x;
          nodesBuffer[i * 2 + 1] = node.y;
      }

      postMessage({ type: 'updateMainBuffers', nodesBuffer }, [nodesBuffer.buffer]);
    }

    self.onmessage = event => {
      // console.log('event.data', event.data);
      // const result = forceLayout.apply(undefined, event.data);

      if(!graph) graph = event.data.graph;

      const { options, type } = event.data;
      // console.log(type);

      const { nodes, links } = graph;

      if(type === 'createSimulation') {
        if(!simulation) {
          const { alpha, alphaDecay, alphaTarget, iterations, nodeRepulsionStrength, width, height } = options;

          simulation = d3.forceSimulation()
            .alpha(alpha)
            .alphaDecay(alphaDecay)
            .alphaTarget(alphaTarget)
            .nodes(nodes)
            .force("link", d3.forceLink(links).id(d => d.id))
            .force("charge", d3.forceManyBody().strength(-nodeRepulsionStrength))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .tick(iterations)
            .stop()
            ;

        }

        copyDataToBuffers(event.data.nodesBuffer);

      } else if(type === 'updateWorkerGraph') {
        graph = event.data.graph;
        simulation
          .nodes(graph.nodes)
          .force("link", d3.forceLink(graph.links).id(d => d.id))
        ;

      } else if(type === 'updateWorkerNodePositions') {
        const { nodes } = event.data;

        const n = simulation.nodes();
        for(var i = 0; i < n.length; i++){
            n[i].x = nodes[i].x;
            n[i].y = nodes[i].y;
        }

      } else if(type === 'updateWorkerBuffers') {
        if(simulation) {
          const { iterations, width, height } = options;

          simulation
            .force('center', d3.forceCenter(width / 2, height / 2))
            .tick(iterations)
            ;
        }

        copyDataToBuffers(event.data.nodesBuffer);

      }

    }
  `;

  const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(workerBlob)
  worker = new Worker(workerUrl);

  worker.onmessage = event => {
    // worker.terminate();
    // URL.revokeObjectURL(workerUrl);

    const { type } = event.data;

    nodesBuffer = event.data.nodesBuffer;

    if(type === 'updateMainBuffers') {
      // console.log(nodesBuffer);
      // graph = event.data;

      updateNodesFromBuffer();

    }

  };

  createWorkerSimulation();

}

function createWorkerSimulation() {
    sendTime = Date.now();
    worker.postMessage({
      type: 'createSimulation',
      graph,
      options: {
        alpha: ALPHA,
        alphaDecay: ALPHA_DECAY,
        alphaTarget: ALPHA_TARGET,
        iterations: FORCE_LAYOUT_ITERATIONS,
        nodeRepulsionStrength: FORCE_LAYOUT_NODE_REPULSION_STRENGTH,
        width,
        height,
      },
      nodesBuffer,
    }, [nodesBuffer.buffer]);

}

function updateWorkerBuffers() {
  if(!params.useWebWorker) return;

  sendTime = Date.now();
  worker.postMessage({
    type: 'updateWorkerBuffers',
    options: {
      iterations: FORCE_LAYOUT_ITERATIONS,
      nodeRepulsionStrength: FORCE_LAYOUT_NODE_REPULSION_STRENGTH,
      width,
      height,
    },
    nodesBuffer,
  }, [nodesBuffer.buffer]);

}

function updateWorkerGraph() {
  worker.postMessage({
    type: 'updateWorkerGraph',
    graph,
  });

}

function updateWorkerNodePositions() {
  worker.postMessage({
    type: 'updateWorkerNodePositions',
    nodes: graph.nodes,
  });

}

function createMainThreadSimulation() {
  const { nodes, links } = graph;

  simulation = d3.forceSimulation()
    .nodes(nodes)
    .force("link", d3.forceLink(links).id(d => d.id))
    .alpha(ALPHA)
    .alphaDecay(ALPHA_DECAY)
    .alphaTarget(ALPHA_TARGET)
    ;

  if(params.useWebWorker) simulation.stop();

  updateMainThreadSimulation();

}

function updateMainThreadSimulation() {
  // const { nodes, links } = graph;

  simulation
    .force("charge", d3.forceManyBody().strength(-FORCE_LAYOUT_NODE_REPULSION_STRENGTH))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .tick(FORCE_LAYOUT_ITERATIONS)
    .on('tick', updatePositionsFromMainThreadSimulation)
    // .stop()
    ;

}

function updateNodesFromBuffer() {
  // Update nodes from buffer
  for(var i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if(draggingNode !== node) {
      // const gfx = gfxMap.get(node);
      const gfx = gfxIDMap[node.id];
      // gfx.position = new PIXI.Point(x, y);

      if(params.interpolatePositions) {
        gfx.smoothFollowX.set(node.x = nodesBuffer[i * 2 + 0]);
        gfx.smoothFollowY.set(node.y = nodesBuffer[i * 2 + 1]);
      } else {
        gfx.position.x = node.x = nodesBuffer[i * 2 + 0];
        gfx.position.y = node.y = nodesBuffer[i * 2 + 1];
      }

    }
  }

  // graph.nodes.forEach((node) => {
  //     let { x, y } = node;
  //     gfxIDMap[node.id].position = new PIXI.Point(x, y);
  // });

  // linksGfx.clear();
  // linksGfx.alpha = 0.6;
  //
  // graph.links.forEach((link) => {
  //   const source = gfxIDMap[link.source];
  //   const target = gfxIDMap[link.target];
  //
  //   if(source && target) {
  //     linksGfx.lineStyle(Math.sqrt(link.value), 0x999999);
  //     linksGfx.moveTo(source.x, source.y);
  //     linksGfx.lineTo(target.x, target.y);
  //   }
  //
  // });
  //
  // linksGfx.endFill();
  //
  // // app.renderer.render(container);

  // If the worker was faster than the time step (dt seconds), we want to delay the next timestep
  let delay = delta * 1000 - (Date.now() - sendTime);
  if(delay < 0) {
      delay = 0;
  }
  setTimeout(updateWorkerBuffers, delay);

  workerStats.end();
  workerStats.begin();

}

function updatePositionsFromMainThreadSimulation() { // only when not using web worker
  // stats.begin();
  if(params.useWebWorker) return;

  if(graph) {
    graph.nodes.forEach((node) => {
        let { x, y } = node;
        const gfx = gfxMap.get(node);
        // const gfx = gfxIDMap[node.id];
        // gfx.position = new PIXI.Point(x, y);
        if(params.interpolatePositions) {
          gfx.smoothFollowX.set(node.x);
          gfx.smoothFollowY.set(node.y);
        } else {
          gfx.position.x = node.x;
          gfx.position.y = node.y;
        }
    });

    // linksGfx.clear();
    // linksGfx.alpha = 0.6;
    //
    // graph.links.forEach((link) => {
    //     const source = gfxIDMap[link.source.id];
    //     const target = gfxIDMap[link.target.id];
    //
    //     linksGfx.lineStyle(Math.sqrt(link.value), 0x999999);
    //     if(params.interpolatePositions) {
    //       linksGfx.moveTo(source.smoothFollowX.valueSmooth, source.smoothFollowY.valueSmooth);
    //       linksGfx.lineTo(target.smoothFollowX.valueSmooth, target.smoothFollowY.valueSmooth);
    //     } else {
    //       linksGfx.moveTo(source.x, source.y);
    //       linksGfx.lineTo(target.x, target.y);
    //     }
    // });
    //
    // linksGfx.endFill();
  }

  // stats.end();
}

function updateInterpolatedPositions() {
  if(!graph || !params.interpolatePositions) return;

  // stats.begin();

  for(var i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if(draggingNode !== node) {
      // const gfx = gfxMap.get(node);
      const gfx = gfxIDMap[node.id];
      // gfx.position = new PIXI.Point(x, y);
      gfx.smoothFollowX.loop(delta);
      gfx.smoothFollowY.loop(delta);
      gfx.position.x = gfx.smoothFollowX.getSmooth();
      gfx.position.y = gfx.smoothFollowY.getSmooth();
    }
  }

  // stats.end();
}

function drawLines() {
  linksGfx.clear();

  if(!graph || !params.drawLines) return;

  graph.links.forEach((link) => {
    const source = gfxIDMap[link.source.id || link.source];
    const target = gfxIDMap[link.target.id || link.target];

    if(source && target) {
      linksGfx.lineStyle(Math.sqrt(link.value), 0x999999);
      linksGfx.moveTo(source.x, source.y);
      linksGfx.lineTo(target.x, target.y);
    }

  });

  linksGfx.endFill();

  // app.renderer.render(container);

}

const moveNode = (nodeData, point) => {
  const gfx = gfxMap.get(nodeData);

  gfx.x = nodeData.x = point.x;
  gfx.y = nodeData.y = point.y;

};

function onDragStart(event) {
  draggingNode = nodeMap.get(event.currentTarget);

  this.data = event.data;
  this.alpha = 0.5;
  this.dragging = true;

  this.dragOffset = this.data.getLocalPosition(this.parent);
  this.dragOffset.x -= this.position.x;
  this.dragOffset.y -= this.position.y;

  // enable node dragging
  // app.renderer.plugins.interaction.on('mousemove', appMouseMove);

  // disable viewport dragging
  // viewport.pause = true;
}

function onDragMove() {
  if(this.dragging && draggingNode) {
      const newPosition = this.data.getLocalPosition(this.parent);
      draggingNode.fx = draggingNode.x = this.x = newPosition.x - this.dragOffset.x;
      draggingNode.fy = draggingNode.y = this.y = newPosition.y - this.dragOffset.y;
  }
}

function onDragEnd() {
  if(draggingNode) {
    if(params.interpolatePositions) {
      this.smoothFollowX.reset(this.position.x);
      this.smoothFollowY.reset(this.position.y);
    }

    if(params.useWebWorker) {
      updateWorkerNodePositions();
    }

    draggingNode.fx = null;
    draggingNode.fy = null;
  }

  draggingNode = undefined;

  this.alpha = 1;
  this.dragging = false;
  // set the interaction data to null
  this.data = null;

  // disable node dragging
  // app.renderer.plugins.interaction.off('mousemove', appMouseMove);
  // enable viewport dragging
  // viewport.pause = false;
};
