import Stats from 'https://unpkg.com/stats.js@0.17.0/src/Stats.js';

// import {GUI} from 'https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js';

import { hyper, multiply } from './graph-utils.js';



const USE_WEB_WORKER = true;
const FORCE_LAYOUT_NODE_REPULSION_STRENGTH = 10;
const FORCE_LAYOUT_ITERATIONS = 1;
const MULTIPLY = 1;
const HYPER = 4;

const gfxIDMap = {}; // store references to node graphics by node id
const gfxMap = new WeakMap(); // store references to node graphics by node

let graph;
let simulation; // simulation when not using web worker
let worker; // web worker
let sendTime; // Time when we sent last message
let delta = 1 / 60;
let width = window.innerWidth;
let height = window.innerHeight;
let nodesBuffer;

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

// app.ticker.add(ticked);

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
      gfx.drawCircle(0, 0, 5);
      container.addChild(gfx);
      gfxIDMap[node.id] = gfx;
      gfxMap.set(node, gfx);
    });

    // d3.select(renderer.view)
    //     .call(d3.drag()
    //         .container(renderer.view)
    //         .subject(() => simulation.find(d3.event.x, d3.event.y))
    //         .on('start', dragstarted)
    //         .on('drag', dragged)
    //         .on('end', dragended));

    const workerCode = `
      importScripts('https://unpkg.com/d3@5.12.0/dist/d3.min.js');

      let simulation;
      let graph;

      function forceLayout(options) {
        const { nodes, links } = graph;
        const { iterations, nodeRepulsionStrength, width, height } = options;

        if(!simulation) {
          simulation = d3.forceSimulation()
            .alpha(0.25)
            .alphaDecay(0.005)
            .alphaTarget(0.025)
            .nodes(nodes)
            .force("link", d3.forceLink(links).id(d => d.id))
            ;

        }

        simulation
          .force("charge", d3.forceManyBody().strength(-nodeRepulsionStrength))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .stop()
          .tick(iterations)
          ;

      };

      self.onmessage = event => {
        // console.log('event.data', event.data);
        // const result = forceLayout.apply(undefined, event.data);

        if(!graph) graph = event.data.graph;

        forceLayout(event.data.options);

        // Copy over the data to the buffers
        var nodesBuffer = event.data.nodesBuffer;
        for(var i = 0; i < graph.nodes.length; i++){
            var node = graph.nodes[i];
            nodesBuffer[i * 2 + 0] = node.x;
            nodesBuffer[i * 2 + 1] = node.y;
        }

        postMessage({ nodesBuffer }, [nodesBuffer.buffer]);
      }
    `;

    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob)
    worker = new Worker(workerUrl);

    worker.onmessage = event => {
      // worker.terminate();
      // URL.revokeObjectURL(workerUrl);

      // console.log(event.data);
      nodesBuffer = event.data.nodesBuffer;
      // console.log(nodesBuffer);
      // graph = event.data;

      updateNodesFromBuffer();

      // If the worker was faster than the time step (dt seconds), we want to delay the next timestep
      let delay = delta * 1000 - (Date.now() - sendTime);
      if(delay < 0) {
          delay = 0;
      }

      setTimeout(sendDataToWorker, delay);

    };

    if(USE_WEB_WORKER) {
      console.log('Using web worker');
      // Create main thread simulation just in order to set link sources and targets:

      sendDataToWorker(true);

    } else {
      console.log('Using only main thread');

      runSimulationWithoutWebworker();
    }

});

function sendDataToWorker(sendGraph = false) {
    sendTime = Date.now();
    // worker.postMessage({
    //     N : N,
    //     dt : dt,
    //     cannonUrl : document.location.href.replace(/\/[^/]*$/,"/") + "../build/cannon.js",
    //     positions : positions,
    //     quaternions : quaternions
    // },[positions.buffer, quaternions.buffer]);
    worker.postMessage({
      graph: sendGraph ? graph : null,
      options: {
        iterations: FORCE_LAYOUT_ITERATIONS,
        nodeRepulsionStrength: FORCE_LAYOUT_NODE_REPULSION_STRENGTH,
        width,
        height,
      },
      nodesBuffer,
    }, [nodesBuffer.buffer]);

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
    .on('tick', ticked)
    // .stop()
    ;


}

function updateNodesFromBuffer() {
    stats.begin();

    // Update nodes from buffer
    for(var i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      node.x = nodesBuffer[i * 2 + 0];
      node.y = nodesBuffer[i * 2 + 1];
      // const gfx = gfxMap.get(node);
      const gfx = gfxIDMap[node.id];
      // gfx.position = new PIXI.Point(x, y);
      gfx.position.x = node.x;
      gfx.position.y = node.y;
    }

    // graph.nodes.forEach((node) => {
    //     let { x, y } = node;
    //     gfxIDMap[node.id].position = new PIXI.Point(x, y);
    // });

    linksGfx.clear();
    linksGfx.alpha = 0.6;

    graph.links.forEach((link) => {
      const source = gfxIDMap[link.source];
      const target = gfxIDMap[link.target];

      if(source && target) {
        linksGfx.lineStyle(Math.sqrt(link.value), 0x999999);
        linksGfx.moveTo(source.x, source.y);
        linksGfx.lineTo(target.x, target.y);
      }

    });

    linksGfx.endFill();

    // app.renderer.render(container);

    stats.end();
}

function ticked() {
  stats.begin();

  if(graph) {
    graph.nodes.forEach((node) => {
        let { x, y } = node;
        const gfx = gfxMap.get(node);
        // const gfx = gfxIDMap[node.id];
        // gfx.position = new PIXI.Point(x, y);
        gfx.position.x = node.x;
        gfx.position.y = node.y;
    });

    linksGfx.clear();
    linksGfx.alpha = 0.6;

    graph.links.forEach((link) => {
        let { source, target } = link;
        linksGfx.lineStyle(Math.sqrt(link.value), 0x999999);
        linksGfx.moveTo(source.x, source.y);
        linksGfx.lineTo(target.x, target.y);
    });

    linksGfx.endFill();
  }

  stats.end();
}

function dragstarted() {
  // if (!d3.event.active) simulation.alphaTarget(0.3).restart();
  d3.event.subject.fx = d3.event.subject.x;
  d3.event.subject.fy = d3.event.subject.y;
}

function dragged() {
  d3.event.subject.fx = d3.event.x;
  d3.event.subject.fy = d3.event.y;
}

function dragended() {
  // if (!d3.event.active) simulation.alphaTarget(0);
  d3.event.subject.fx = null;
  d3.event.subject.fy = null;
}
