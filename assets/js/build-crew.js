/*!
 * Build Crew v1.0.0
 * A crew of colored multiplayer cursors builds your page on load: each agent flies to a
 * part of the page, drags out a selection frame with its size, and the part appears.
 *
 * MIT License, (c) 2026 Martin Geltl. https://github.com/MartinGeltl21/build-crew
 *
 * Load it in <head> WITHOUT defer/async so marked parts are hidden before first paint:
 *   <script src="build-crew.js" data-agents="6"></script>
 *
 * Mark what the crew should build:
 *   <section data-build>…</section>          wipes in from top to bottom (default)
 *   <h1 data-build="fade">…</h1>             fades in
 *   <img data-build="pop">                   scales in
 *   <div data-build="none">…</div>           just appears; its own CSS animations wait
 *                                            until it is built, then run ("own" = alias)
 * Or let a selector pick targets: data-targets="h1, p, .card"
 *
 * Options (data-* on the script tag, or window.BuildCrewConfig = {…} before it):
 *   start          auto (default) | manual (call BuildCrew.start() yourself)
 *   targets        extra CSS selector for targets, in addition to [data-build]
 *   agents         number of cursors, 1–12 (default 6)
 *   names          comma list of cursor names
 *   colors         comma list of cursor colors (hex)
 *   speed          animation speed factor, 2 = twice as fast (default 1)
 *   delay          ms to wait before starting (default 0)
 *   once           "session" = play once per browser session, then show the page directly
 *   safety         ms after page load when everything is shown no matter what (default 9000),
 *                  so a page that never calls start() in manual mode is never left blank
 *   reducedMotion  skip (default) = no crew for visitors who prefer reduced motion | ignore
 *   seed           any number = the same flight paths on every load (for screenshots, tests)
 *
 * API: BuildCrew.start(), BuildCrew.finish(), BuildCrew.isRunning(),
 *      BuildCrew.whenBuilt(element, callback) -> unsubscribe
 * Events: "buildcrew:built" on each target (bubbles), "buildcrew:done" on window.
 */
(() => {
  "use strict";

  if (window.BuildCrew) return;

  const script = document.currentScript;
  const data = (script && script.dataset) || {};
  const user = window.BuildCrewConfig || {};
  const pick = (key, fallback) =>
    data[key] !== undefined ? data[key] : user[key] !== undefined ? user[key] : fallback;
  const list = (value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const config = {
    start: String(pick("start", "auto")).toLowerCase(),
    targets: String(pick("targets", "")).trim(),
    agents: clamp(Math.round(number(pick("agents", 6), 6)), 1, 12),
    names: list(pick("names", "")),
    colors: list(pick("colors", "")),
    speed: clamp(number(pick("speed", 1), 1), 0.25, 4),
    delay: Math.max(0, number(pick("delay", 0), 0)),
    once: String(pick("once", "")).toLowerCase(),
    safety: Math.max(1000, number(pick("safety", 9000), 9000)),
    reducedMotion: String(pick("reducedMotion", "skip")).toLowerCase(),
    seed: pick("seed", ""),
  };

  // Math.random by default; with a seed a small deterministic generator (mulberry32).
  const random = (() => {
    if (config.seed === "" || !Number.isFinite(Number(config.seed))) return Math.random;
    let state = Number(config.seed) >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const CREW = [
    ["Layout", "#f97316"],
    ["Type", "#22c55e"],
    ["Color", "#a855f7"],
    ["Grid", "#0ea5e9"],
    ["Motion", "#ec4899"],
    ["Copy", "#eab308"],
    ["Pixel", "#14b8a6"],
    ["Spacing", "#ef4444"],
    ["Icons", "#6366f1"],
    ["Polish", "#84cc16"],
    ["Contrast", "#f43f5e"],
    ["Rhythm", "#06b6d4"],
  ];

  const SELECTOR = config.targets ? `[data-build], ${config.targets}` : "[data-build]";
  const BUILT = "data-bc-built";
  const ONCE_KEY = "build-crew:played";
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  // ------------------------------------------------------------ should it run?

  function played() {
    if (config.once !== "session") return false;
    try {
      return sessionStorage.getItem(ONCE_KEY) === "1";
    } catch {
      return false;
    }
  }

  const reduced =
    config.reducedMotion !== "ignore" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const enabled = !reduced && !played() && typeof Element.prototype.animate === "function";

  // ------------------------------------------------------------ page styles

  // Hides targets until they are built and holds their own animations. Removed when done.
  let pendingStyle = null;
  let validSelector = true;
  try {
    document.createDocumentFragment().querySelector(SELECTOR);
  } catch {
    validSelector = false;
    console.warn("[build-crew] Invalid data-targets selector, using [data-build] only.");
  }
  const TARGETS = validSelector ? SELECTOR : "[data-build]";

  // Constructable stylesheets are not blocked by a Content-Security-Policy without
  // 'unsafe-inline'; older browsers fall back to a <style> element.
  const constructable = (() => {
    try {
      return "adoptedStyleSheets" in Document.prototype && typeof new CSSStyleSheet().replaceSync === "function";
    } catch {
      return false;
    }
  })();

  function sheetFor(css) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  }

  /** Adds CSS to a document or shadow root and returns a function that removes it again. */
  function addStyle(root, id, css) {
    if (constructable) {
      const sheet = sheetFor(css);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return () => {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((item) => item !== sheet);
      };
    }
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    (root === document ? document.head || document.documentElement : root).appendChild(style);
    return () => style.remove();
  }

  if (enabled) {
    pendingStyle = addStyle(
      document,
      "build-crew-pending",
      `:is(${TARGETS}):not([${BUILT}]){opacity:0!important}` +
        `:is(${TARGETS}):not([${BUILT}]),:is(${TARGETS}):not([${BUILT}]) *{animation-play-state:paused!important}`,
    );
    // Reveal animations. No "forwards" fill, so no clip-path stays behind to cut off focus rings.
    addStyle(
      document,
      "build-crew-reveal",
      `[${BUILT}]:not([data-build="none"]):not([data-build="own"]){animation:bc-wipe .46s cubic-bezier(.22,1,.36,1) backwards}` +
        `[${BUILT}][data-build="fade"]{animation-name:bc-fade}` +
        `[${BUILT}][data-build="pop"]{animation-name:bc-pop}` +
        `@keyframes bc-wipe{from{opacity:0;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}` +
        `@keyframes bc-fade{from{opacity:0}}` +
        `@keyframes bc-pop{from{opacity:0;transform:scale(.92)}}`,
    );
  }

  // ------------------------------------------------------------ state + helpers

  let running = false;
  let finished = !enabled;
  let cancelled = false;
  let host = null;
  let safetyTimer = 0;
  let observer = null;
  const animations = new Set();

  function targetsIn(root) {
    try {
      return [...root.querySelectorAll(TARGETS)];
    } catch {
      return [];
    }
  }

  function reveal(element) {
    if (element.hasAttribute(BUILT)) return;
    element.setAttribute(BUILT, "");
    element.dispatchEvent(new CustomEvent("buildcrew:built", { bubbles: true }));
  }

  function isBuilt(element) {
    return finished || element.hasAttribute(BUILT);
  }

  /** Calls `callback` once the target around `element` is built, or right away. */
  function whenBuilt(element, callback) {
    const target = element && element.closest ? element.closest(TARGETS) : null;
    if (!target || isBuilt(target)) {
      callback();
      return () => {};
    }
    const onBuilt = (event) => {
      if (event.target !== target) return;
      stop();
      callback();
    };
    const onDone = () => {
      stop();
      callback();
    };
    function stop() {
      target.removeEventListener("buildcrew:built", onBuilt);
      window.removeEventListener("buildcrew:done", onDone);
    }
    target.addEventListener("buildcrew:built", onBuilt);
    window.addEventListener("buildcrew:done", onDone);
    return stop;
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelled = true;
    running = false;
    clearTimeout(safetyTimer);
    if (observer) observer.disconnect();
    animations.forEach((animation) => animation.cancel());
    targetsIn(document).forEach(reveal);
    if (host) host.remove();
    if (pendingStyle) pendingStyle();
    pendingStyle = null;
    if (config.once === "session") {
      try {
        sessionStorage.setItem(ONCE_KEY, "1");
      } catch {
        /* storage blocked: it will play again, which is fine */
      }
    }
    window.dispatchEvent(new CustomEvent("buildcrew:done"));
  }

  function inkFor(hex) {
    const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
    if (!match) return "#ffffff";
    const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.55 ? "#111111" : "#ffffff";
  }

  function crew() {
    return Array.from({ length: config.agents }, (_, index) => {
      const fallback = CREW[index % CREW.length];
      const name = config.names[index] || fallback[0];
      const color = config.colors[index] || fallback[1];
      return { name, color, ink: inkFor(color) };
    });
  }

  // ------------------------------------------------------------ overlay

  const OVERLAY_CSS = `
:host{all:initial}
.agent{position:absolute;top:0;left:0;z-index:2;will-change:transform}
.agent svg{display:block;width:22px;height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
.name{position:absolute;top:19px;left:15px;padding:2px 7px;border-radius:3px 9px 9px 9px;
  box-shadow:0 2px 8px rgba(0,0,0,.2);font:600 11px/16px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap}
.frame{position:absolute;border:1.5px solid var(--c);border-radius:2px;box-sizing:border-box;
  background:color-mix(in srgb,var(--c) 8%,transparent)}
.frame i{position:absolute;width:7px;height:7px;box-sizing:border-box;border:1.5px solid var(--c);border-radius:1px;background:#fff}
.frame i:nth-child(1){top:-4px;left:-4px}.frame i:nth-child(2){top:-4px;right:-4px}
.frame i:nth-child(3){bottom:-4px;left:-4px}.frame i:nth-child(4){right:-4px;bottom:-4px}
.size{opacity:0;position:absolute;top:calc(100% + 7px);left:50%;transform:translateX(-50%);padding:2px 5px;border-radius:4px;
  background:var(--c);color:var(--ink);font:500 10px/14px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap}`;

  const ARROW =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5v17.2l4.6-4.3 3.3 6.9 3.2-1.5-3.2-6.8h6.4z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function createOverlay() {
    const root = document.documentElement;
    host = document.createElement("build-crew");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "all:initial;position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;z-index:2147483000;" +
      `width:${root.clientWidth}px;height:${Math.max(root.scrollHeight, document.body.scrollHeight)}px;`;
    const shadow = host.attachShadow({ mode: "open" });
    addStyle(shadow, "build-crew-overlay", OVERLAY_CSS);
    // Cursors and frames go into their own layer, so ordering never depends on style nodes.
    const layer = document.createElement("div");
    shadow.appendChild(layer);
    document.body.appendChild(host);
    return layer;
  }

  // ------------------------------------------------------------ the build

  function play(element, keyframes, options) {
    const animation = element.animate(keyframes, { fill: "forwards", ...options });
    animations.add(animation);
    return animation.finished.catch(() => undefined).finally(() => animations.delete(animation));
  }

  function box(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, w: rect.width, h: rect.height };
  }

  function edgePoint() {
    const left = window.scrollX;
    const top = window.scrollY;
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const side = Math.floor(random() * 4);
    if (side === 0) return { x: left - 40, y: top + random() * height };
    if (side === 1) return { x: left + width + 40, y: top + random() * height };
    if (side === 2) return { x: left + random() * width, y: top - 40 };
    return { x: left + random() * width, y: top + height + 40 };
  }

  // A nested target (a field inside a card) waits until the card around it is built.
  function parentBuilt(element) {
    const parent = element.parentElement && element.parentElement.closest(TARGETS);
    if (!parent || isBuilt(parent)) return Promise.resolve();
    return new Promise((done) => whenBuilt(parent, done));
  }

  async function agentLoop(agent, index, queue, layer) {
    const speed = config.speed;
    const cursor = document.createElement("div");
    cursor.className = "agent";
    cursor.style.color = agent.color;
    cursor.innerHTML = ARROW;
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = agent.name;
    label.style.cssText = `background:${agent.color};color:${agent.ink}`;
    cursor.appendChild(label);
    layer.appendChild(cursor);

    let position = edgePoint();
    cursor.style.transform = `translate(${position.x}px,${position.y}px)`;
    await sleep((index * 90) / speed);

    async function flyTo(next, fixedDuration) {
      const distance = Math.hypot(next.x - position.x, next.y - position.y);
      const duration = fixedDuration !== undefined ? fixedDuration : Math.min(720, 220 + distance * 0.55) / speed;
      // A slight arc instead of a straight line feels like a hand on a mouse.
      const bend = (random() - 0.5) * Math.min(120, distance * 0.3);
      const middle = {
        x: (position.x + next.x) / 2 + bend * ((next.y - position.y) / (distance || 1)),
        y: (position.y + next.y) / 2 - bend * ((next.x - position.x) / (distance || 1)),
      };
      await play(
        cursor,
        [
          { transform: `translate(${position.x}px,${position.y}px)` },
          { transform: `translate(${middle.x}px,${middle.y}px)` },
          { transform: `translate(${next.x}px,${next.y}px)` },
        ],
        { duration, easing: "cubic-bezier(.45,0,.2,1)" },
      );
      position = next;
    }

    while (!cancelled) {
      const element = queue.shift();
      if (!element) break;

      const start = box(element);
      await flyTo({ x: start.x - 4, y: start.y - 4 });
      await parentBuilt(element);
      if (cancelled) return;

      // Measure again: the surrounding card may have moved while it was being built.
      const { x, y, w, h } = box(element);
      const frame = document.createElement("div");
      frame.className = "frame";
      frame.style.cssText = `left:${x}px;top:${y}px;width:0;height:0;--c:${agent.color};--ink:${agent.ink}`;
      frame.innerHTML = "<i></i><i></i><i></i><i></i>";
      const size = document.createElement("span");
      size.className = "size";
      size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      frame.appendChild(size);
      layer.insertBefore(frame, layer.firstChild);

      const drawMs = Math.min(560, 260 + Math.hypot(w, h) * 0.45) / speed;
      position = { x: x - 4, y: y - 4 };
      await Promise.all([
        play(frame, [{ width: "0px", height: "0px" }, { width: `${w}px`, height: `${h}px` }], {
          duration: drawMs,
          easing: "cubic-bezier(.3,0,.2,1)",
        }),
        flyTo({ x: x + w - 4, y: y + h - 4 }, drawMs),
        // The size label shows up once the frame has nearly reached its size.
        play(size, [{ opacity: 0 }, { opacity: 1 }], { duration: drawMs * 0.3, delay: drawMs * 0.65 }),
      ]);
      if (cancelled) return;

      reveal(element);
      play(frame, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 / speed, delay: 160 / speed }).then(() =>
        frame.remove(),
      );
      await sleep(60 / speed);
    }

    if (cancelled) return;
    await Promise.all([
      flyTo(edgePoint(), 750 / speed),
      play(cursor, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 / speed, delay: 200 / speed }),
    ]);
    cursor.remove();
  }

  async function run() {
    await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), sleep(500)]);
    if (config.delay) await sleep(config.delay);
    if (cancelled) return;

    const viewportBottom = window.scrollY + window.innerHeight * 1.1;
    const visible = [];
    const later = [];
    for (const element of targetsIn(document)) {
      if (element.hasAttribute(BUILT)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) reveal(element);
      else if (rect.top + window.scrollY > viewportBottom) later.push(element);
      else visible.push(element);
    }

    // Parts far below the fold appear with their reveal animation when scrolled into view.
    if (later.length && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          reveal(entry.target);
        }
      });
      later.forEach((element) => observer.observe(element));
    } else {
      later.forEach(reveal);
    }

    // Top to bottom; within a row left to right.
    const queue = visible
      .map((element) => ({ element, ...box(element) }))
      .sort((a, b) => (Math.abs(a.y - b.y) < 24 ? a.x - b.x : a.y - b.y))
      .map((item) => item.element);

    const layer = createOverlay();
    await Promise.all(crew().map((agent, index) => agentLoop(agent, index, queue, layer)));
    if (cancelled) return;

    // Done with the visible part. Remaining targets below the fold keep their observer.
    running = false;
    if (host) host.remove();
    if (!later.length || !observer) finish();
    else {
      clearTimeout(safetyTimer);
      if (pendingStyle) {
        // Below-the-fold targets stay hidden only until they scroll in; then show the rest.
        const check = () => {
          if (targetsIn(document).every((element) => element.hasAttribute(BUILT))) {
            window.removeEventListener("buildcrew:built", check);
            finish();
          }
        };
        window.addEventListener("buildcrew:built", check);
        check();
      }
    }
  }

  function start() {
    if (!enabled || running || finished) return;
    running = true;
    cancelled = false;
    run().catch((error) => {
      console.error("[build-crew]", error);
      finish();
    });
  }

  window.BuildCrew = {
    start,
    finish,
    whenBuilt,
    isRunning: () => running,
    config,
  };

  if (!enabled) {
    window.dispatchEvent(new CustomEvent("buildcrew:done"));
    return;
  }

  safetyTimer = setTimeout(finish, config.safety);

  if (config.start !== "manual") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})();
