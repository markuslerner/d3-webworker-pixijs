# D3 – Web Worker – pixi.js


Experiment running [D3 force directed graph](https://github.com/d3/d3-force) simulation in a [web worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) while using [pixi.js](https://www.pixijs.com/) for the rendering.

The CPU-intensive simulation runs entirely in the web worker at a lower framerate while the main rendering thread can run independently. The nodes positions are then copied to the main thread and interpolated at each frame so that the movement looks smooth.


[Demo](https://dev.markuslerner.com/d3-webworker-pixijs/index.html)



### Used libraries

* [d3-force](https://github.com/d3/d3-force) – force directed graph simulation
* [pixi.js](https://www.pixijs.com/) – fast 2D WebGL renderer
* [stats.js](https://github.com/mrdoob/stats.js) – JavaScript Performance Monitor
* [dat.gui](https://github.com/dataarts/dat.gui) – lightweight controller library


### Based on:
* https://bl.ocks.org/kirjavascript/dcafa2b3a53cbcc9c5de19b938b92119
* https://observablehq.com/@zakjan/force-directed-graph-pixi



#### License ####

MIT licensed

Copyright (C) 2020 Markus Lerner, http://www.markuslerner.com
