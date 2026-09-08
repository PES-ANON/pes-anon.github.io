"use strict";

const gallery = window.PES_DEMOS;
const groups = {
  repetition: "REPEATED PLACEMENT",
  occlusion: "OCCLUDED DESTINATION",
  removal: "AGIBOT TASKS"
};
const demo = document.querySelector("#demo-video");
const demoPlot = new window.SyncedPlot(document.querySelector("#demo-plot"), demo,
  ({ count }) => { document.querySelector("#demo-count").textContent = count; });
const tabs = [...document.querySelectorAll("[data-demo]")];
const selectedCases = {};
let activeScenario = null;
let activeCase = null;

function loadCase(item) {
  if (activeCase === item.id) return;
  activeCase = item.id;
  selectedCases[activeScenario] = item.id;
  demo.pause();
  document.querySelector("#camera-labels").hidden = !item.multiview;
  document.querySelector("#demo-panel").classList.toggle("is-multiview", Boolean(item.multiview));
  demo.poster = item.poster;
  demo.querySelector("source").src = item.media;
  demo.setAttribute("aria-label", item.label + (item.multiview ? " synchronized head and right wrist video" : " result video"));
  demo.load();
  demoPlot.setData(item);
  document.querySelector("#demo-kicker").textContent = groups[item.group];
  document.querySelector("#demo-title").textContent = item.title;
  document.querySelector("#demo-description").textContent = item.description;
  document.querySelector("#demo-panel").dataset.caseId = item.id;
  const choices = [...document.querySelectorAll("[data-case]")];
  choices.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.case === item.id)));
  const index = choices.findIndex(button => button.dataset.case === item.id);
  document.querySelector("#case-position").textContent = `Case ${index + 1} / ${choices.length}`;
}

function switchDemo(button) {
  const key = button.dataset.demo;
  if (key === activeScenario) return;
  activeScenario = key;
  document.querySelector("#demo-panel").setAttribute("aria-labelledby", button.id);
  tabs.forEach(tab => {
    const active = tab === button;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  const cases = gallery.cases.filter(item => item.group === key);
  const container = document.querySelector("#demo-cases");
  container.replaceChildren();
  for (const item of cases) {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "case-card";
    choice.dataset.case = item.id;
    choice.setAttribute("aria-pressed", "false");
    const poster = document.createElement("img");
    poster.src = item.thumbnail; poster.alt = ""; poster.loading = "lazy";
    poster.width = 96; poster.height = 54;
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = item.label;
    const meta = document.createElement("small");
    const removals = item.events.filter(event => event.delta < 0).length;
    meta.textContent = removals
      ? `${item.events.length - removals} add · ${removals} remove · ${Math.round(item.duration)} s`
      : `${item.events.length} events · ${Math.round(item.duration)} s`;
    copy.append(label, meta); choice.append(poster, copy);
    choice.addEventListener("click", () => loadCase(item));
    container.append(choice);
  }
  loadCase(cases.find(item => item.id === selectedCases[key]) || cases[0]);
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => switchDemo(tab));
  tab.addEventListener("keydown", event => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].focus();
    switchDemo(tabs[next]);
  });
});
switchDemo(tabs[0]);
document.querySelector("#replay-demo").addEventListener("click", () => {
  demo.currentTime = 0;
  demo.play().catch(() => { /* The native controls remain available. */ });
});

const hero = document.querySelector("#hero-video");
const heroData = gallery.cases.find(item => item.id === gallery.hero.caseId);
const heroPlot = new window.SyncedPlot(document.querySelector("#hero-plot"), hero,
  ({ count }) => { document.querySelector("#hero-count").textContent = count; });
heroPlot.setData(heroData, { start: gallery.hero.start, end: gallery.hero.end, offset: gallery.hero.start });
const heroToggle = document.querySelector("#hero-toggle");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let heroEnabled = !reducedMotion.matches;
let heroInView = true;
function updateHeroPlayback() {
  if (heroEnabled && heroInView && !document.hidden && demo.paused) {
    hero.play().catch(() => {});
  } else hero.pause();
}
function updateHeroButton() {
  heroToggle.textContent = hero.paused ? "Play" : "Pause";
  heroToggle.setAttribute("aria-label", `${hero.paused ? "Play" : "Pause"} background video`);
}
hero.addEventListener("play", updateHeroButton);
hero.addEventListener("pause", updateHeroButton);
heroToggle.addEventListener("click", () => {
  heroEnabled = hero.paused;
  updateHeroPlayback();
});
new IntersectionObserver(entries => {
  heroInView = entries[0].isIntersecting;
  updateHeroPlayback();
}, { threshold: .15 }).observe(hero);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) demo.pause();
  updateHeroPlayback();
});
demo.addEventListener("play", () => hero.pause());
demo.addEventListener("pause", updateHeroPlayback);
reducedMotion.addEventListener("change", event => {
  heroEnabled = !event.matches;
  updateHeroPlayback();
});

// A deterministic explanation of ledger behavior, not recorded VLM output.
let ledger = [];
let nextId = 1;
let occluded = false;
const stateCount = () => ledger.filter(event => event.valid).reduce((count, event) => Math.max(0, count + event.effect), 0);
const latestAdd = () => [...ledger].reverse().find(event => event.valid && event.effect === 1);
const actionButton = action => document.querySelector(`[data-action="${action}"]`);
function renderLedger(message) {
  const count = stateCount();
  document.querySelector("#count").textContent = count;
  const objects = document.querySelector("#objects");
  objects.replaceChildren();
  for (let index = 0; index < Math.min(count, 10); index++) {
    const dot = document.createElement("i");
    dot.className = `object${occluded ? " hidden" : ""}`;
    objects.append(dot);
  }
  if (count > 10) {
    const more = document.createElement("span");
    more.className = "object-more";
    more.textContent = `+${count - 10}`;
    objects.append(more);
  }
  document.querySelector("#visibility").textContent = occluded ? "◌ Occluded" : "● Visible";
  actionButton("occlude").textContent = occluded ? "◉ Reveal the scene" : "◌ Occlude the scene";
  const rows = document.querySelector("#ledger-rows");
  rows.replaceChildren();
  ledger.forEach(event => {
    const row = document.createElement("tr");
    if (!event.valid) row.className = "invalid";
    [event.id, event.effect > 0 ? "+1" : "−1", event.valid ? "Committed" : "Invalidated"].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 1) cell.className = event.effect > 0 ? "effect-positive" : "effect-negative";
      row.append(cell);
    });
    rows.append(row);
  });
  if (!ledger.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "No committed events yet.";
    row.append(cell); rows.append(row);
  }
  actionButton("remove").disabled = count === 0 || occluded;
  actionButton("add").disabled = occluded;
  actionButton("duplicate").disabled = !ledger.length;
  actionButton("invalidate").disabled = !latestAdd();
  document.querySelector("#ledger-message").textContent = message;
}
document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
  const before = stateCount();
  let message;
  switch (button.dataset.action) {
    case "add":
    case "remove": {
      const effect = button.dataset.action === "add" ? 1 : -1;
      if (occluded || (effect < 0 && before === 0)) return;
      const id = `E${nextId++}`;
      ledger.push({ id, effect, valid: true });
      message = `${id} committed (${effect > 0 ? "+1" : "−1"}). Count: ${before} → ${stateCount()}.`;
      break;
    }
    case "duplicate": {
      const latest = ledger.at(-1);
      if (!latest) return;
      message = `${latest.id} already exists${latest.valid ? "" : " and has been invalidated"}. Replaying the same ID leaves the count at ${before}.`;
      break;
    }
    case "occlude":
      occluded = !occluded;
      message = occluded ? `No new visual evidence. The established count stays at ${before}.` : `The scene is visible again. Count stays at ${before} until a new event is accepted.`;
      break;
    case "invalidate": {
      const event = latestAdd();
      if (!event) return;
      event.valid = false;
      message = `${event.id} invalidated. Replay the remaining valid events with a nonnegative count: ${before} → ${stateCount()}. This corrects an estimate; it is not a new removal.`;
      break;
    }
    case "reset":
      ledger = []; nextId = 1; occluded = false;
      message = "Start with an empty target. Add the first object.";
      break;
  }
  renderLedger(message);
  const display = document.querySelector(".count-display");
  if (before !== stateCount() && !reducedMotion.matches) {
    display.classList.remove("flash");
    void display.offsetWidth;
    display.classList.add("flash");
  }
}));
renderLedger("Start with an empty target. Add the first object.");

const navLinks = [...document.querySelectorAll(".nav nav a")];
let scrollFramePending = false;
function updateScrollMeter() {
  const distance = document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.setProperty("--page-progress", distance > 0 ? String(Math.min(1, Math.max(0, scrollY / distance))) : "0");
  scrollFramePending = false;
}
function scheduleScrollMeter() {
  if (!scrollFramePending) {
    scrollFramePending = true;
    requestAnimationFrame(updateScrollMeter);
  }
}
addEventListener("scroll", scheduleScrollMeter, { passive: true });
addEventListener("resize", scheduleScrollMeter);
document.querySelectorAll("details").forEach(item => item.addEventListener("toggle", scheduleScrollMeter));
updateScrollMeter();
const sectionObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    for (const link of navLinks) {
      const active = link.hash === `#${entry.target.id}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
}, { rootMargin: "-15% 0px -60% 0px" });
navLinks.forEach(link => sectionObserver.observe(document.querySelector(link.hash)));
