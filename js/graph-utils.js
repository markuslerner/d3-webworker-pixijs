// Taken from https://observablehq.com/@zakjan/graph-utils



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
