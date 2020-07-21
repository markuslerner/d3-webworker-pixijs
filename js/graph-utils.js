// Taken from https://observablehq.com/@zakjan/graph-utils


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
