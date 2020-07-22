// Taken from:
// https://observablehq.com/@zakjan/graph-utils
// http://bl.ocks.org/MNoichl/11c575aa09619aad70cb09d8801ad045



export const createRandomGraph = (n, m) => { //creates a random graph on n nodes and m links
  // var nodes = d3.range(n).map(Object);

  var nodes = d3.range(n).map((n) => {
    return {
      id: n,
    }
  });
  // var list  = randomChoose(unorderedPairs(d3.range(n)), m);
  // var links = list.map(function (a) { return {source: a[0], target: a[1]} });
  var links = [];
  // for(var i = 0; i < m; i++) {
  //   links.push({ source: randomChoose(nodes, 1)[0].id, target: randomChoose(nodes, 1)[0].id, value: 0 });
  // }

  return { nodes, links };
};

const randomChoose = (s, k) => { // returns a random k element subset of s
  var a = [], i = -1, j;
  while (++i < k) {
    j = Math.floor(Math.random() * s.length);
    a.push(s.splice(j, 1)[0]);
  };
  return a;
};

const unorderedPairs = (s) => { // returns the list of all unordered pairs from s
  var i = -1, a = [], j;
  while (++i < s.length) {
    j = i;
    while (++j < s.length) a.push([s[i],s[j]])
  };
  return a;
};

const range = n => new Array(n).fill(undefined).map((_, i) => i);

export const multiply = (graph, n = 1) => {
  if (n === 0) {
    return empty();
  }
  if (n === 1) {
    return graph;
  }

  graph = {
    nodes: range(n).flatMap(i => {
      return graph.nodes.map(node => {
        return { ...node, id: `${node.id}#${i}` };
      });
    }),
    links: range(n).flatMap(i => {
      return graph.links.map(link => {
        return { ...link, source: `${link.source}#${i}`, target: `${link.target}#${i}` };
      });
    }),
  };

  return graph;
};


export const hyper = (graph, n = 0) => {
  if (n === 0) {
    return graph;
  }

  for (let i = 0; i < n; i++) {
    const separator = i === 0 ? '#' : '';

    graph = {
      nodes: graph.nodes.flatMap(node => {
        return [
          { ...node, id: `${node.id}${separator}0` },
          { ...node, id: `${node.id}${separator}1` },
        ];
      }),
      links: [
        ...graph.nodes.flatMap(node => {
          return { source: `${node.id}${separator}0`, target: `${node.id}${separator}1` };
        }),
        ...graph.links.flatMap(link => {
          return [
            { ...link, source: `${link.source}${separator}0`, target: `${link.target}${separator}0` },
            { ...link, source: `${link.source}${separator}1`, target: `${link.target}${separator}1` },
          ];
        }),
      ],
    };
  }

  return graph;
};
