// Based on:
// https://bl.ocks.org/kirjavascript/dcafa2b3a53cbcc9c5de19b938b92119
// https://observablehq.com/@zakjan/force-directed-graph-pixi

import Stats from 'https://unpkg.com/stats.js@0.17.0/src/Stats.js';

// import {GUI} from 'https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js';

import SmoothFollow from './SmoothFollow.js';

import { hyper, multiply } from './graph-utils.js';



const USE_WEB_WORKER = true;
const INTERPOLATE_POSITIONS = true;
const FORCE_LAYOUT_NODE_REPULSION_STRENGTH = 10;
const FORCE_LAYOUT_ITERATIONS = 1;
const MULTIPLY = 1;
const HYPER = 6;
const NODE_RADIUS = 5;
const NODE_HIT_WIDTH = 5;
const NODE_HIT_RADIUS = NODE_RADIUS + NODE_HIT_WIDTH;

const gfxIDMap = {}; // store references to node graphics by node id
const gfxMap = new WeakMap(); // store references to node graphics by node
const nodeMap = new WeakMap(); // store references to nodes by node graphics

let graph;
let simulation; // simulation when not using web worker
let worker; // web worker
let sendTime; // Time when we sent last message
let delta = 1 / 60;
let width = window.innerWidth;
let height = window.innerHeight;
let nodesBuffer;
let draggingNode;

const stats = new Stats();
document.body.appendChild( stats.dom );
stats.dom.style.left = 'auto';
stats.dom.style.right = '0px';
stats.dom.style.top = 'auto';
stats.dom.style.bottom = '0px';

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
});

const container = new PIXI.Container();
app.stage.addChild(container);

const linksGfx = new PIXI.Graphics();
container.addChild(linksGfx);

app.ticker.add(() => {
  stats.begin();
  stats.end();
});

if(INTERPOLATE_POSITIONS) {
  app.ticker.add(updateInterpolatedPositions);
}

// app.ticker.add(drawLines);

const colour = (function() {
    const scale = d3.scaleOrdinal(d3.schemeCategory10);
    return (num) => parseInt(scale(num).slice(1), 16);
})();

d3.json("https://gist.githubusercontent.com/mbostock/4062045/raw/5916d145c8c048a6e3086915a6be464467391c62/miserables.json")
.then(json => {
    graph = JSON.parse(JSON.stringify(json));

    console.log('Original graph: ' + graph.nodes.length + ' nodes, ' + graph.links.length + ' links');

    graph = hyper(multiply(graph, MULTIPLY), HYPER);
    console.log('multiply: ' + MULTIPLY + ', hyper: ' + HYPER);
    console.log(graph.nodes.length + ' nodes, ' + graph.links.length + ' links');

    nodesBuffer = new Float32Array(graph.nodes.length * 2);

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
      gfx.smoothFollowX = new SmoothFollow(1.0);
      gfx.smoothFollowY = new SmoothFollow(1.0);

      container.addChild(gfx);
      gfxIDMap[node.id] = gfx;
      gfxMap.set(node, gfx);
      nodeMap.set(gfx, node);
    });

    if(USE_WEB_WORKER) {
      console.log('Using web worker');

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
              simulation = d3.forceSimulation()
                .alpha(0.25)
                .alphaDecay(0.005)
                .alphaTarget(0.025)
                .nodes(nodes)
                .force("link", d3.forceLink(links).id(d => d.id))
                ;

            }

            copyDataToBuffers(event.data.nodesBuffer);

          } else if(type === 'updateWorkerNodes') {
            const { nodes } = event.data;

            const n = simulation.nodes();
            for(var i = 0; i < n.length; i++){
                n[i].x = nodes[i].x;
                n[i].y = nodes[i].y;
            }

          } else {
            if(simulation) {
              const { iterations, nodeRepulsionStrength, width, height } = options;

              simulation
                .force("charge", d3.forceManyBody().strength(-nodeRepulsionStrength))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .stop()
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

          // If the worker was faster than the time step (dt seconds), we want to delay the next timestep
          let delay = delta * 1000 - (Date.now() - sendTime);
          if(delay < 0) {
              delay = 0;
          }
          setTimeout(updateWorkerBuffers, delay);

        }

      };

      // Create main thread simulation just in order to set link sources and targets:

      createWorkerSimulation();

    } else {
      console.log('Using only main thread');

      runSimulationWithoutWebworker();
    }

});

function createWorkerSimulation() {
    sendTime = Date.now();
    worker.postMessage({
      type: 'createSimulation',
      graph,
      options: {
        iterations: FORCE_LAYOUT_ITERATIONS,
        nodeRepulsionStrength: FORCE_LAYOUT_NODE_REPULSION_STRENGTH,
        width,
        height,
      },
      nodesBuffer,
    }, [nodesBuffer.buffer]);

}

function updateWorkerBuffers() {
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

function updateWorkerNodes() {
  worker.postMessage({
    type: 'updateWorkerNodes',
    nodes: graph.nodes,
  });

}

function runSimulationWithoutWebworker() {
  const { nodes, links } = graph;
  if(!simulation) {
    simulation = d3.forceSimulation()
      .alpha(0.25)
      .alphaDecay(0.005)
      .alphaTarget(0.025)
      ;

  }
  simulation
    .nodes(nodes)
    .force("link", d3.forceLink(links).id(d => d.id))
    .force("charge", d3.forceManyBody().strength(-FORCE_LAYOUT_NODE_REPULSION_STRENGTH))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .tick(FORCE_LAYOUT_ITERATIONS)
    .on('tick', updatePositionsFromSimulation)
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

        if(INTERPOLATE_POSITIONS) {
          gfx.smoothFollowX.value = node.x = nodesBuffer[i * 2 + 0];
          gfx.smoothFollowY.value = node.y = nodesBuffer[i * 2 + 1];
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

}

function updatePositionsFromSimulation() { // only when not using web worker
  // stats.begin();

  if(graph) {
    graph.nodes.forEach((node) => {
        let { x, y } = node;
        const gfx = gfxMap.get(node);
        // const gfx = gfxIDMap[node.id];
        // gfx.position = new PIXI.Point(x, y);
        if(INTERPOLATE_POSITIONS) {
          gfx.smoothFollowX.value = node.x;
          gfx.smoothFollowY.value = node.y;
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
    //     if(INTERPOLATE_POSITIONS) {
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
  if(!graph) return;

  // stats.begin();

  for(var i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if(draggingNode !== node) {
      // const gfx = gfxMap.get(node);
      const gfx = gfxIDMap[node.id];
      // gfx.position = new PIXI.Point(x, y);
      gfx.smoothFollowX.loop(delta);
      gfx.smoothFollowY.loop(delta);
      gfx.position.x = gfx.smoothFollowX.valueSmooth;
      gfx.position.y = gfx.smoothFollowY.valueSmooth;
    }
  }

  // stats.end();
}

function drawLines() {
  if(!graph) return;

  linksGfx.clear();
  linksGfx.alpha = 0.6;

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
    if(INTERPOLATE_POSITIONS) {
      this.smoothFollowX.value = this.smoothFollowX.valueSmooth = this.position.x;
      this.smoothFollowY.value = this.smoothFollowY.valueSmooth = this.position.y;
    }

    if(USE_WEB_WORKER) {
      updateWorkerNodes();
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
