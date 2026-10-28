/**
 * @description       : Unit tests for the graphEngine service module. Covers the
 *                      one load per page, a failed load that is not cached, the D3_Library resource
 *                      itself (read from disk and run in a vm context with a fake window), and
 *                      layoutGraph on the real d3-force build: inside the box, anchors pull groups
 *                      apart, the same input gives the same output, inputs are not changed. Also
 *                      the seven builds added for pan, zoom and drag, and attachPanZoom and attachNodeDrag on
 *                      the real d3-zoom and d3-drag builds, with the opt in fit, the eased button
 *                      moves and the resting scale for one finger, and boundsOf and fitTransform.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

// The resource loader is mocked here so each test sets what loadScript does. The mock is not
// virtual: the sfdx-lwc-jest resolver gives the module a real stub path, and a virtual mock is
// passed over once another test file in the same worker has resolved that path.
jest.mock("lightning/platformResourceLoader", () => ({
  loadScript: jest.fn(),
  loadStyle: jest.fn()
}));

const RESOURCE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "staticresources",
  "D3_Library.js"
);

// The official UMD builds: the first four for the force layout, the last seven added for pan,
// zoom and drag. Bytes and SHA-256 of each dist/<name>.min.js file from its npm tarball.
const MODULES = [
  {
    banner: "// https://d3js.org/d3-dispatch/ v3.0.1",
    bytes: 1901,
    sha256: "94b3bbdb6b98dc1325a15762b051013e8253999b0e0436b27d1da17b952ba0af"
  },
  {
    banner: "// https://d3js.org/d3-quadtree/ v3.0.1",
    bytes: 5279,
    sha256: "57e2ad12824ed82893ba447523f2a2fb9beeb9222aafb2c778a9f5b313348b0e"
  },
  {
    banner: "// https://d3js.org/d3-timer/ v3.0.1",
    bytes: 1947,
    sha256: "911ceda305f014b6b53ca68d5c896a9a387da120cfd56a421a2c60cca2fc9b36"
  },
  {
    banner: "// https://d3js.org/d3-force/ v3.0.0",
    bytes: 8300,
    sha256: "1e07b473241328795d5ea9ad479a7bbabd765012fa2ef95633c83b69868dff6b"
  },
  {
    banner: "// https://d3js.org/d3-selection/ v3.0.0",
    bytes: 13522,
    sha256: "45daab9cf677901bcae102f3f23ca2930db3c0fb8ff9e3dbed087d9c4de921ca"
  },
  {
    banner: "// https://d3js.org/d3-color/ v3.1.0",
    bytes: 10577,
    sha256: "a12639010163230b8c130fbeb92a3a49bb5f6989a566d3664d759522db458489"
  },
  {
    banner: "// https://d3js.org/d3-interpolate/ v3.0.1",
    bytes: 7863,
    sha256: "bfc321e4c3f3b3aadc88cfe15ccb5e443abfeadef8b75c65b41c33a4d78a98ae"
  },
  {
    banner: "// https://d3js.org/d3-ease/ v3.0.1",
    bytes: 3173,
    sha256: "e60a1ed750a1ad138dd18e8d3f463238113cfbf7d89685a13d19bd4e048dc3ce"
  },
  {
    banner: "// https://d3js.org/d3-transition/ v3.0.1",
    bytes: 11718,
    sha256: "c248d97f6c131af7f4a12a3ff1f2ed83f1cc6c0e17fc764a198b6ee452e6621b"
  },
  {
    banner: "// https://d3js.org/d3-drag/ v3.0.0",
    bytes: 4186,
    sha256: "158499fa8cdeef459e2ab9d01af22babd003c423a212fb24088c0f838864012b"
  },
  {
    banner: "// https://d3js.org/d3-zoom/ v3.0.0",
    bytes: 9984,
    sha256: "4fdce9b830b78225c58e27258296084253c41a5eaf8cad9bd9ccfe3025daf1cf"
  }
];

// A checkout on Windows may hold the file with CRLF endings. The published builds use LF.
function readResource() {
  return fs.readFileSync(RESOURCE_PATH, "utf8").replace(/\r\n/g, "\n");
}

// Runs the resource the way a browser runs a classic script: no module system, a window
// that is also self and globalThis, with the timer functions d3-timer reaches for.
function loadD3FromResource(extraGlobals = {}) {
  const fakeWindow = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...extraGlobals
  };
  fakeWindow.window = fakeWindow;
  fakeWindow.self = fakeWindow;
  const context = vm.createContext(fakeWindow);
  vm.runInContext(readResource(), context, { filename: "D3_Library.js" });
  return vm.runInContext("globalThis", context).d3;
}

// Each test gets a fresh module so the page level promise cache starts empty.
function freshModules() {
  let engine;
  let resourceLoader;
  jest.isolateModules(() => {
    resourceLoader = require("lightning/platformResourceLoader");
    engine = require("c/graphEngine");
  });
  return {
    loadGraphEngine: engine.loadGraphEngine,
    layoutGraph: engine.layoutGraph,
    loadScript: resourceLoader.loadScript
  };
}

const FAKE_D3 = { forceSimulation: function forceSimulation() {} };

describe("c/graphEngine loadGraphEngine", () => {
  afterEach(() => {
    delete window.d3;
    jest.clearAllMocks();
  });

  it("loads D3_Library once for three calls and resolves each to window.d3", async () => {
    const { loadGraphEngine, loadScript } = freshModules();
    loadScript.mockImplementation(() => {
      window.d3 = FAKE_D3;
      return Promise.resolve();
    });
    const component = {};

    const [first, second] = await Promise.all([
      loadGraphEngine(component),
      loadGraphEngine(component)
    ]);
    const third = await loadGraphEngine(component);

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith(component, "D3_Library");
    expect(first).toBe(FAKE_D3);
    expect(second).toBe(FAKE_D3);
    expect(third).toBe(FAKE_D3);
  });

  it("rejects with a clear Error when the script fails to load", async () => {
    const { loadGraphEngine, loadScript } = freshModules();
    loadScript.mockRejectedValue(new Error("network down"));

    await expect(loadGraphEngine({})).rejects.toThrow(
      "D3_Library failed to load: network down"
    );
  });

  it("rejects when the script loads but exposes no d3.forceSimulation", async () => {
    const { loadGraphEngine, loadScript } = freshModules();
    loadScript.mockResolvedValue();

    await expect(loadGraphEngine({})).rejects.toThrow(
      "D3_Library loaded but no d3.forceSimulation was found"
    );
  });

  it("does not cache a failure, so a later call tries again", async () => {
    const { loadGraphEngine, loadScript } = freshModules();
    loadScript
      .mockRejectedValueOnce(new Error("blocked"))
      .mockImplementation(() => {
        window.d3 = FAKE_D3;
        return Promise.resolve();
      });

    await expect(loadGraphEngine({})).rejects.toThrow("blocked");
    await expect(loadGraphEngine({})).resolves.toBe(FAKE_D3);
    expect(loadScript).toHaveBeenCalledTimes(2);
  });
});

describe("D3_Library static resource", () => {
  it("holds the eleven official builds unchanged, in dependency order, with the licence text", () => {
    const text = readResource();
    const starts = MODULES.map((module) => text.indexOf(module.banner));
    starts.forEach((start) => expect(start).toBeGreaterThan(0));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);

    MODULES.forEach((module, index) => {
      const end = index + 1 < MODULES.length ? starts[index + 1] : text.length;
      const segment = text.slice(starts[index], end);
      expect(Buffer.byteLength(segment, "utf8")).toBe(module.bytes);
      expect(crypto.createHash("sha256").update(segment).digest("hex")).toBe(
        module.sha256
      );
    });

    const header = text.slice(0, starts[0]);
    expect(header).toContain("Copyright 2010-2021 Mike Bostock");
    expect(header).toContain(
      "Permission to use, copy, modify, and/or distribute this software"
    );
    expect(header).toContain("Copyright 2001 Robert Penner");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(100 * 1024);
  });

  it("attaches one window.d3 with every force and interaction the engine uses", () => {
    const d3 = loadD3FromResource();

    expect(d3).toBeDefined();
    [
      "forceSimulation",
      "forceManyBody",
      "forceCollide",
      "forceLink",
      "forceX",
      "forceY",
      "dispatch",
      "quadtree",
      "timer",
      "select",
      "selectAll",
      "zoom",
      "zoomTransform",
      "drag"
    ].forEach((name) => expect(typeof d3[name]).toBe("function"));
  });
});

describe("c/graphEngine layoutGraph", () => {
  const { layoutGraph } = freshModules();
  const d3 = loadD3FromResource();
  const WIDTH = 400;
  const HEIGHT = 300;

  // Two groups of eight with links inside each group and one across.
  function sampleGraph() {
    const nodes = [];
    const edges = [];
    ["left", "right"].forEach((group) => {
      for (let i = 0; i < 8; i++) {
        nodes.push({ id: `${group}${i}`, group, radius: 6 + (i % 3) });
        if (i > 0) {
          edges.push({ source: `${group}0`, target: `${group}${i}` });
        }
      }
    });
    edges.push({ source: "left1", target: "right1", kind: "across" });
    return { nodes, edges };
  }

  function centroid(nodes, group) {
    const members = nodes.filter((node) => node.group === group);
    return {
      x: members.reduce((sum, node) => sum + node.x, 0) / members.length,
      y: members.reduce((sum, node) => sum + node.y, 0) / members.length
    };
  }

  it("keeps every node inside the box, radius included", () => {
    const { nodes, edges } = sampleGraph();
    // A strong push and anchors outside the box try to throw nodes out.
    const result = layoutGraph(d3, nodes, edges, {
      width: WIDTH,
      height: HEIGHT,
      charge: -400,
      anchors: { left: { x: -500, y: -500 }, right: { x: 900, y: 900 } }
    });

    expect(result.nodes).toHaveLength(nodes.length);
    result.nodes.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(node.radius);
      expect(node.x).toBeLessThanOrEqual(WIDTH - node.radius);
      expect(node.y).toBeGreaterThanOrEqual(node.radius);
      expect(node.y).toBeLessThanOrEqual(HEIGHT - node.radius);
    });
  });

  it("pulls each group toward its own anchor", () => {
    const { nodes, edges } = sampleGraph();
    const anchors = { left: { x: 80, y: 150 }, right: { x: 320, y: 150 } };
    const result = layoutGraph(d3, nodes, edges, {
      width: WIDTH,
      height: HEIGHT,
      anchors,
      anchorStrength: 0.3
    });

    const left = centroid(result.nodes, "left");
    const right = centroid(result.nodes, "right");
    expect(right.x - left.x).toBeGreaterThan(150);
    expect(Math.abs(left.x - anchors.left.x)).toBeLessThan(40);
    expect(Math.abs(right.x - anchors.right.x)).toBeLessThan(40);
  });

  it("puts groups on a ring when no anchors are given", () => {
    const { nodes, edges } = sampleGraph();
    const result = layoutGraph(d3, nodes, edges, {
      width: WIDTH,
      height: HEIGHT,
      anchorStrength: 0.3
    });

    const left = centroid(result.nodes, "left");
    const right = centroid(result.nodes, "right");
    expect(Math.hypot(right.x - left.x, right.y - left.y)).toBeGreaterThan(100);
  });

  it("gives the same output for the same input twice", () => {
    const first = sampleGraph();
    const second = sampleGraph();
    const options = { width: WIDTH, height: HEIGHT, linkDistance: 40 };

    expect(layoutGraph(d3, first.nodes, first.edges, options)).toEqual(
      layoutGraph(d3, second.nodes, second.edges, options)
    );
  });

  it("returns edge end points, keeps extra fields and drops edges with a missing end", () => {
    const { nodes, edges } = sampleGraph();
    const withStray = [...edges, { source: "left0", target: "nobody" }];
    const result = layoutGraph(d3, nodes, withStray, {
      width: WIDTH,
      height: HEIGHT
    });

    expect(result.edges).toHaveLength(edges.length);
    const across = result.edges.find((edge) => edge.kind === "across");
    const from = result.nodes.find((node) => node.id === "left1");
    const to = result.nodes.find((node) => node.id === "right1");
    expect(across).toMatchObject({
      source: "left1",
      target: "right1",
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y
    });
    expect(from.group).toBe("left");
  });

  it("does not change its inputs", () => {
    const { nodes, edges } = sampleGraph();
    const before = JSON.stringify({ nodes, edges });

    layoutGraph(d3, nodes, edges, { width: WIDTH, height: HEIGHT });

    expect(JSON.stringify({ nodes, edges })).toBe(before);
  });

  it("handles an empty graph", () => {
    expect(layoutGraph(d3, [], [], {})).toEqual({ nodes: [], edges: [] });
  });
});

describe("c/graphEngine attachPanZoom and attachNodeDrag", () => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const EXTENT = [
    [0, 0],
    [800, 600]
  ];
  let d3;
  let engine;

  beforeAll(() => {
    // d3-zoom and d3-drag read navigator and document when they attach, so this copy runs
    // with the test page's own.
    d3 = loadD3FromResource({ navigator: window.navigator, document });
    jest.isolateModules(() => {
      engine = require("c/graphEngine");
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  function svgWithNodes(ids) {
    const svg = document.createElementNS(SVG_NS, "svg");
    const group = document.createElementNS(SVG_NS, "g");
    ids.forEach((id) => {
      const node = document.createElementNS(SVG_NS, "g");
      node.setAttribute("data-id", id);
      node.setAttribute("class", "node");
      group.appendChild(node);
    });
    svg.appendChild(group);
    document.body.appendChild(svg);
    return svg;
  }

  function mouse(type, x, y) {
    return new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0
    });
  }

  it("returns undefined when the library has no d3-zoom or no callback", () => {
    const svg = svgWithNodes([]);
    expect(
      engine.attachPanZoom({ forceSimulation() {} }, svg, { onZoom() {} })
    ).toBeUndefined();
    expect(engine.attachPanZoom(d3, svg, {})).toBeUndefined();
    expect(engine.attachPanZoom(d3, null, { onZoom() {} })).toBeUndefined();
  });

  it("zooms in and out by the step within the limits and resets to the identity", () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, { onZoom, extent: EXTENT });

    controls.zoomIn();
    expect(controls.scale()).toBeCloseTo(engine.ZOOM.step);
    const zoomed = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect(zoomed.k).toBeCloseTo(1.5);
    // scaleBy keeps the centre of the extent still.
    expect(zoomed.x).toBeCloseTo(400 - 400 * 1.5);
    expect(zoomed.y).toBeCloseTo(300 - 300 * 1.5);

    [1, 2, 3, 4, 5].forEach(() => controls.zoomIn());
    expect(controls.scale()).toBe(engine.ZOOM.max);

    [1, 2, 3, 4, 5, 6, 7, 8].forEach(() => controls.zoomOut());
    expect(controls.scale()).toBe(engine.ZOOM.min);

    controls.zoomIn();
    controls.reset();
    const last = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect([last.k, last.x, last.y]).toEqual([1, 0, 0]);
  });

  it("listens for the wheel but never zooms on a double click, and detaches", () => {
    const svg = svgWithNodes([]);
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom() {},
      extent: EXTENT
    });
    const types = () => (svg.__on || []).map((entry) => entry.type);

    expect(types()).toContain("wheel");
    expect(types()).toContain("mousedown");
    expect(types()).not.toContain("dblclick");

    controls.detach();
    expect(types()).not.toContain("wheel");
  });

  it("returns false when the library has no d3-drag or no callbacks", () => {
    const svg = svgWithNodes(["a"]);
    const nodes = svg.querySelectorAll(".node");
    expect(
      engine.attachNodeDrag({}, nodes, { position() {}, onDrag() {} })
    ).toBe(false);
    expect(engine.attachNodeDrag(d3, nodes, { position() {} })).toBe(false);
  });

  it("reports a dragged node's new position from its starting point", () => {
    const svg = svgWithNodes(["a", "b"]);
    const onDrag = jest.fn();
    const onEnd = jest.fn();
    const positions = { a: { x: 100, y: 50 }, b: { x: 300, y: 200 } };
    const attached = engine.attachNodeDrag(d3, svg.querySelectorAll(".node"), {
      position: (id) => positions[id],
      onDrag,
      onEnd
    });
    expect(attached).toBe(true);

    const node = svg.querySelector('[data-id="b"]');
    node.dispatchEvent(mouse("mousedown", 10, 10));
    window.dispatchEvent(mouse("mousemove", 40, 30));
    window.dispatchEvent(mouse("mouseup", 40, 30));

    expect(onDrag).toHaveBeenCalledWith("b", 330, 220);
    expect(onEnd).toHaveBeenCalledWith("b");
  });

  it("starts no drag on a node with no known position", () => {
    const svg = svgWithNodes(["ghost"]);
    const onDrag = jest.fn();
    engine.attachNodeDrag(d3, svg.querySelectorAll(".node"), {
      position: () => undefined,
      onDrag
    });

    svg
      .querySelector('[data-id="ghost"]')
      .dispatchEvent(mouse("mousedown", 0, 0));
    window.dispatchEvent(mouse("mousemove", 20, 20));
    window.dispatchEvent(mouse("mouseup", 20, 20));

    expect(onDrag).not.toHaveBeenCalled();
  });

  function wheel(deltaY, ctrlKey) {
    return new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: 400,
      clientY: 300,
      deltaY,
      deltaMode: 0,
      ctrlKey
    });
  }

  const PAN_EXTENT = [
    [-100, -100],
    [900, 700]
  ];

  it("leaves a plain wheel to the page and zooms on Ctrl with the wheel when asked", () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom,
      extent: EXTENT,
      ctrlWheel: true
    });

    const plain = wheel(-100, false);
    svg.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(onZoom).not.toHaveBeenCalled();
    expect(controls.scale()).toBe(1);

    const withCtrl = wheel(-100, true);
    svg.dispatchEvent(withCtrl);
    expect(withCtrl.defaultPrevented).toBe(true);
    // One notch with Ctrl is capped at one button step, not d3's ten times.
    expect(controls.scale()).toBeCloseTo(engine.ZOOM.step);
  });

  it("still zooms on a plain wheel by default", () => {
    const svg = svgWithNodes([]);
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom() {},
      extent: EXTENT
    });

    svg.dispatchEvent(wheel(-100, false));
    expect(controls.scale()).toBeGreaterThan(1);
  });

  it("pans at the resting scale inside a pan limit larger than the view, and stops at it", () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom,
      extent: EXTENT,
      translateExtent: PAN_EXTENT
    });

    controls.panBy(-40, 30);
    let last = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect([last.k, last.x, last.y]).toEqual([1, -40, 30]);

    controls.panBy(-500, 500);
    last = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    // The margin is 100 on each side, so the view moves no further than that.
    expect([last.x, last.y]).toEqual([-100, 100]);
  });

  it("keeps the old pan limit when no larger one is given", () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom,
      extent: EXTENT
    });

    controls.panBy(-40, 30);
    const last = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect([last.x, last.y]).toEqual([0, 0]);
  });

  it("pans the same distance on screen at any scale", () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom,
      extent: EXTENT,
      translateExtent: PAN_EXTENT
    });
    controls.zoomIn();
    const before = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];

    controls.panBy(-40, 0);
    const after = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect(after.k).toBeCloseTo(before.k);
    expect(after.x - before.x).toBeCloseTo(-40);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("pans by a background drag at the resting scale and reports the mouse gesture", () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const onGestureEnd = jest.fn();
    engine.attachPanZoom(d3, svg, {
      onZoom,
      onGestureEnd,
      extent: EXTENT,
      translateExtent: PAN_EXTENT
    });

    svg.dispatchEvent(mouse("mousedown", 100, 100));
    window.dispatchEvent(mouse("mousemove", 130, 120));
    window.dispatchEvent(mouse("mouseup", 130, 120));

    const last = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect([last.k, last.x, last.y]).toEqual([1, 30, 20]);
    expect(onGestureEnd).toHaveBeenCalledWith("mouse");
  });

  // A touch event as d3-zoom reads it: touches still down, and the ones that changed.
  function touch(type, down, changed) {
    const event = new CustomEvent(type, { bubbles: true, cancelable: true });
    const list = (points) =>
      points.map(([identifier, x, y]) => ({
        identifier,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y
      }));
    Object.defineProperty(event, "touches", { value: list(down) });
    Object.defineProperty(event, "changedTouches", { value: list(changed) });
    event.view = window;
    return event;
  }

  it("reports a two finger touch gesture as one pinch when it ends", () => {
    const svg = svgWithNodes([]);
    // d3-zoom listens for touches only where the browser has them, which jsdom does not say.
    svg.ontouchstart = null;
    const onZoom = jest.fn();
    const onGestureEnd = jest.fn();
    engine.attachPanZoom(d3, svg, {
      onZoom,
      onGestureEnd,
      extent: EXTENT,
      translateExtent: PAN_EXTENT,
      ctrlWheel: true
    });

    const a = [1, 100, 100];
    const b = [2, 200, 100];
    svg.dispatchEvent(touch("touchstart", [a, b], [a, b]));
    const a2 = [1, 80, 100];
    const b2 = [2, 260, 100];
    svg.dispatchEvent(touch("touchmove", [a2, b2], [a2, b2]));
    svg.dispatchEvent(touch("touchend", [b2], [a2]));
    svg.dispatchEvent(touch("touchend", [], [b2]));

    const last = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect(last.k).toBeGreaterThan(1);
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith("pinch");
  });

  it("calls a one finger pan that a second finger joins a pinch, and a plain one a touch", () => {
    const svg = svgWithNodes([]);
    // d3-zoom listens for touches only where the browser has them, which jsdom does not say.
    svg.ontouchstart = null;
    const onGestureEnd = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom() {},
      onGestureEnd,
      extent: EXTENT,
      translateExtent: PAN_EXTENT,
      ctrlWheel: true
    });
    // One finger moves the graph only once it is zoomed in.
    controls.zoomIn();

    const a = [1, 100, 100];
    const a2 = [1, 120, 110];
    svg.dispatchEvent(touch("touchstart", [a], [a]));
    svg.dispatchEvent(touch("touchmove", [a2], [a2]));
    svg.dispatchEvent(touch("touchend", [], [a2]));
    expect(onGestureEnd.mock.calls).toEqual([["touch"]]);

    const b = [2, 220, 110];
    const b2 = [2, 260, 110];
    svg.dispatchEvent(touch("touchstart", [a], [a]));
    svg.dispatchEvent(touch("touchstart", [a, b], [b]));
    svg.dispatchEvent(touch("touchmove", [a, b2], [b2]));
    svg.dispatchEvent(touch("touchend", [b2], [a]));
    svg.dispatchEvent(touch("touchend", [], [b2]));
    expect(onGestureEnd.mock.calls).toEqual([["touch"], ["pinch"]]);
  });

  it("reports a Ctrl wheel gesture once it ends, and nothing for a button", async () => {
    const svg = svgWithNodes([]);
    const onGestureEnd = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom() {},
      onGestureEnd,
      extent: EXTENT,
      ctrlWheel: true
    });

    controls.zoomIn();
    expect(onGestureEnd).not.toHaveBeenCalled();

    svg.dispatchEvent(wheel(-10, true));
    svg.dispatchEvent(wheel(-10, true));
    expect(onGestureEnd).not.toHaveBeenCalled();
    // d3-zoom ends a wheel gesture 150 ms after the last event, on the real timers this copy
    // of the library captured when it loaded.
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith("wheel");
  });

  it("moves to a fitted transform at once, inside the limits, and ignores a bad one", () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom,
      extent: EXTENT,
      translateExtent: PAN_EXTENT,
      min: 0.5
    });

    controls.fitTo({ x: 100, y: 75, k: 0.75 });
    let last = onZoom.mock.calls[onZoom.mock.calls.length - 1][0];
    expect([last.k, last.x, last.y]).toEqual([0.75, 100, 75]);

    controls.fitTo({ x: 0, y: 0, k: 0.1 });
    expect(controls.scale()).toBe(0.5);

    const calls = onZoom.mock.calls.length;
    controls.fitTo({ x: NaN, y: 0, k: 1 });
    controls.fitTo(undefined);
    expect(onZoom.mock.calls.length).toBe(calls);
  });

  it("eases a button move over a duration and moves at once without one", async () => {
    const svg = svgWithNodes([]);
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, { onZoom, extent: EXTENT });

    controls.zoomIn(250);
    // A transition starts on the next timer tick, so nothing has moved yet.
    expect(controls.scale()).toBe(1);
    await new Promise((resolve) => {
      setTimeout(resolve, 450);
    });
    expect(controls.scale()).toBeCloseTo(engine.ZOOM.step);
    // Several frames were drawn on the way.
    expect(onZoom.mock.calls.length).toBeGreaterThan(2);

    controls.reset(0);
    expect(controls.scale()).toBe(1);
  });

  it("leaves one finger to the page at a resting scale above the minimum", () => {
    const svg = svgWithNodes([]);
    svg.ontouchstart = null;
    const onZoom = jest.fn();
    const controls = engine.attachPanZoom(d3, svg, {
      onZoom,
      extent: EXTENT,
      translateExtent: PAN_EXTENT,
      min: 0.5,
      rest: 0.8
    });
    controls.fitTo({ x: 80, y: 60, k: 0.8 });
    const calls = onZoom.mock.calls.length;

    const a = [1, 100, 100];
    const a2 = [1, 140, 120];
    svg.dispatchEvent(touch("touchstart", [a], [a]));
    svg.dispatchEvent(touch("touchmove", [a2], [a2]));
    svg.dispatchEvent(touch("touchend", [], [a2]));
    expect(onZoom.mock.calls.length).toBe(calls);
  });
});

describe("c/graphEngine boundsOf and fitTransform", () => {
  let engine;

  beforeAll(() => {
    jest.isolateModules(() => {
      engine = require("c/graphEngine");
    });
  });

  it("joins boxes with a margin, skips bad ones and answers null for none", () => {
    expect(
      engine.boundsOf(
        [
          { left: 10, top: 20, right: 30, bottom: 40 },
          { left: -5, top: 25, right: 15, bottom: 60 },
          { left: NaN, top: 0, right: 1, bottom: 1 },
          null
        ],
        5
      )
    ).toEqual({ left: -10, top: 15, right: 35, bottom: 65 });
    expect(engine.boundsOf([])).toBeNull();
    expect(engine.boundsOf(undefined)).toBeNull();
  });

  it("centres a box in the extent at the scale that shows it whole", () => {
    const extent = [
      [0, 0],
      [800, 600]
    ];
    // 400 by 200 fits at 2 by width and 3 by height, so 2 wins.
    const fit = engine.fitTransform(
      { left: 100, top: 100, right: 500, bottom: 300 },
      extent,
      { min: 0.25, max: 4 }
    );
    expect(fit).toEqual({ x: 400 - 300 * 2, y: 300 - 200 * 2, k: 2 });

    // A box larger than the extent scales down, and the limits hold.
    const wide = engine.fitTransform(
      { left: 0, top: 0, right: 1600, bottom: 600 },
      extent,
      { min: 0.25, max: 4 }
    );
    expect(wide.k).toBe(0.5);
    expect(
      engine.fitTransform({ left: 0, top: 0, right: 1, bottom: 1 }, extent).k
    ).toBe(engine.ZOOM.max);
    expect(engine.fitTransform(null, extent)).toEqual({ x: 0, y: 0, k: 1 });
  });
});
