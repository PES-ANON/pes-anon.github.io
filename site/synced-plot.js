"use strict";

// Dependency-free SVG presentation of recorded scores. No fitting or smoothing.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  let sequence = 0;
  const svgElement = (tag, attributes = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const latest = (points, time) => {
    let answer = null;
    for (const point of points) {
      if (point[0] > time + 1e-6) break;
      answer = point;
    }
    return answer;
  };

  class SyncedPlot {
    constructor(host, video, onUpdate = () => {}) {
      this.host = host;
      this.video = video;
      this.onUpdate = onUpdate;
      this.uid = `trace-${++sequence}`;
      this.visible = true;
      this.frame = null;
      this.toolbar = document.createElement("div");
      this.toolbar.className = "plot-toolbar";
      this.toolbar.innerHTML = '<div class="plot-legend"><span><i class="green"></i>Event evidence</span><span><i class="orange"></i>State progress</span></div><span class="plot-time"></span>';
      this.timeLabel = this.toolbar.querySelector(".plot-time");
      this.svg = svgElement("svg", { role: "img", "aria-label": "Event evidence and state progress, from zero to one, over video time" });
      this.host.append(this.toolbar, this.svg);
      const refresh = () => { this.draw(); this.schedule(); };
      for (const type of ["timeupdate", "seeking", "seeked", "loadedmetadata", "play", "pause", "ended", "ratechange"]) {
        video.addEventListener(type, refresh);
      }
      this.resizeObserver = new ResizeObserver(() => { this.layout(); this.draw(); });
      this.resizeObserver.observe(host);
      this.visibilityObserver = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
        this.draw(); this.schedule();
      });
      this.visibilityObserver.observe(host);
      document.addEventListener("visibilitychange", () => this.schedule());
    }

    setData(data, { start = 0, end = data.duration, offset = 0 } = {}) {
      this.data = data;
      this.start = start; this.end = end; this.offset = offset;
      this.host.dataset.caseId = data.id;
      this.layout(); this.draw();
    }

    layout() {
      if (!this.data) return;
      this.width = Math.max(220, this.host.clientWidth);
      this.height = this.host.id === "hero-plot" ? 190 : 205;
      this.bounds = { left: 29, right: this.width - 12, top: 44, bottom: this.height - 37 };
      const { left, right, top, bottom } = this.bounds;
      this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
      this.svg.setAttribute("height", this.height);
      this.svg.replaceChildren();
      const defs = svgElement("defs");
      const gradients = [];
      for (const [name, color] of [["evidence", "#009e73"], ["progress", "#d57515"]]) {
        const gradient = svgElement("linearGradient", { id: `${this.uid}-${name}`, gradientUnits: "userSpaceOnUse", x1: left, x2: right, y1: 0, y2: 0 });
        gradient.append(svgElement("stop", { offset: "0", "stop-color": color, "stop-opacity": ".25" }), svgElement("stop", { offset: "1", "stop-color": color }));
        gradients.push(gradient); defs.append(gradient);
      }
      this.gradients = gradients;
      this.svg.append(defs);
      for (const value of [0, .5, 1]) {
        const y = this.y(value);
        this.svg.append(svgElement("line", { x1: left, y1: y, x2: right, y2: y, class: "plot-grid" }));
        const label = svgElement("text", { x: left - 9, y: y + 4, "text-anchor": "end", class: "plot-axis" });
        label.textContent = value; this.svg.append(label);
      }
      const tickCount = this.width > 450 ? 4 : 2;
      for (let index = 0; index <= tickCount; index++) {
        const time = this.start + (this.end - this.start) * index / tickCount;
        const label = svgElement("text", { x: this.x(time), y: bottom + 19, "text-anchor": index === 0 ? "start" : index === tickCount ? "end" : "middle", class: "plot-axis" });
        label.textContent = `${Number(time.toFixed(1))}`;
        this.svg.append(label);
      }
      const unit = svgElement("text", { x: (left + right) / 2, y: this.height - 2, "text-anchor": "middle", class: "plot-axis" });
      unit.textContent = "Time (s)"; this.svg.append(unit);
      this.eventNodes = [];
      const lastLabelX = [-Infinity, -Infinity];
      for (const event of this.data.events.filter(e => e.time >= this.start && e.time <= this.end)) {
        const x = this.x(event.time);
        const group = svgElement("g", { class: "plot-event", "data-time": event.time, "data-delta": event.delta });
        const title = svgElement("title");
        title.textContent = `${event.type} · ${event.time.toFixed(1)} s`;
        group.append(title, svgElement("line", { x1: x, x2: x, y1: top, y2: bottom }));
        const labelGap = this.width < 550 ? 39 : 78;
        const labelX = Math.max(left + labelGap / 2, Math.min(right - labelGap / 2, x));
        const lane = lastLabelX.findIndex(previous => labelX - previous >= labelGap);
        if (lane >= 0) {
          const label = svgElement("text", { x: labelX, y: top - 26 + lane * 16, "text-anchor": "middle" });
          label.textContent = `${event.delta > 0 ? "+" : "−"}1 · ${event.time.toFixed(1)}s`;
          // Compact labels retain the time; the sign remains in the tooltip.
          if (this.width < 550) label.textContent = `${event.time.toFixed(1)}s`;
          group.append(label); lastLabelX[lane] = labelX;
        }
        group.style.visibility = "hidden";
        this.eventNodes.push({ event, group }); this.svg.append(group);
      }
      this.evidencePath = svgElement("path", { class: "plot-curve", stroke: `url(#${this.uid}-evidence)`, "data-series": "evidence" });
      this.progressPath = svgElement("path", { class: "plot-curve", stroke: `url(#${this.uid}-progress)`, "data-series": "progress" });
      this.cursor = svgElement("line", { y1: top, y2: bottom, class: "plot-cursor" });
      this.evidenceDot = svgElement("circle", { r: 3.5, fill: "#009e73" });
      this.progressDot = svgElement("circle", { r: 3.5, fill: "#d57515" });
      this.svg.append(this.progressPath, this.evidencePath, this.cursor, this.progressDot, this.evidenceDot);
    }

    x(time) { return this.bounds.left + (time - this.start) / (this.end - this.start) * (this.bounds.right - this.bounds.left); }
    y(value) { return this.bounds.bottom - value * (this.bounds.bottom - this.bounds.top); }

    path(points, time, step) {
      const previous = latest(points, this.start);
      const visible = previous ? [[this.start, previous[1]]] : [];
      for (const point of points) if (point[0] > this.start && point[0] <= time + 1e-6) visible.push(point);
      if (!visible.length) return "";
      let path = `M${this.x(visible[0][0])},${this.y(visible[0][1])}`;
      for (const [t, value] of visible.slice(1)) {
        path += step ? `H${this.x(t)}V${this.y(value)}` : `L${this.x(t)},${this.y(value)}`;
      }
      // Hold only the last observed value. Never interpolate towards a future sample.
      path += `H${this.x(time)}`;
      return path;
    }

    draw() {
      if (!this.data || !this.bounds) return;
      const time = Math.min(this.end, Math.max(this.start, (this.video.currentTime || 0) + this.offset));
      this.host.dataset.sourceTime = time.toFixed(4);
      this.timeLabel.textContent = `${time.toFixed(1)} s`;
      this.evidencePath.setAttribute("d", this.path(this.data.evidence, time, false));
      this.progressPath.setAttribute("d", this.path(this.data.progress, time, true));
      const x = this.x(time);
      for (const gradient of this.gradients) gradient.setAttribute("x2", Math.max(this.bounds.left + 1, x));
      this.cursor.setAttribute("x1", x); this.cursor.setAttribute("x2", x);
      for (const [points, dot] of [[this.data.evidence, this.evidenceDot], [this.data.progress, this.progressDot]]) {
        const point = latest(points, time);
        dot.style.visibility = point ? "visible" : "hidden";
        if (point) { dot.setAttribute("cx", x); dot.setAttribute("cy", this.y(point[1])); }
      }
      let count = this.data.initialCount;
      for (const event of this.data.events) if (event.time <= time + 1e-6) count = Math.max(0, count + event.delta);
      for (const { event, group } of this.eventNodes) group.style.visibility = event.time <= time + 1e-6 ? "visible" : "hidden";
      this.host.dataset.count = count;
      this.onUpdate({ count, time });
    }

    schedule() {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      if (this.video.paused || this.video.ended || document.hidden || !this.visible) return;
      this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); this.schedule(); });
    }
  }
  window.SyncedPlot = SyncedPlot;
})();
