/* Dependency-free behavioral smoke tests for the browser-local runtime. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "banks.json"), "utf8"));
const stored = new Map();
const app = { innerHTML: "", addEventListener() {}, querySelector() { return null; } };
const announcer = { textContent: "" };
const document = {
  fullscreenEnabled: true,
  fullscreenElement: null,
  getElementById(id) { return id === "app" ? app : announcer; },
  querySelector() { return null; },
  addEventListener() {},
  documentElement: { requestFullscreen() { return Promise.resolve(); } },
  exitFullscreen() { return Promise.resolve(); }
};
const context = {
  console,
  document,
  window: { setTimeout, setInterval, clearInterval, addEventListener() {}, AudioContext: undefined },
  setTimeout, setInterval, clearInterval,
  localStorage: { getItem: key => stored.has(key) ? stored.get(key) : null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
  stored,
  structuredClone,
  fetch: async url => ({ ok: true, status: 200, json: async () => url.includes("banks.json") ? data : { files: [], warnings: [] } }),
  Blob, URL, FileReader: class {}, HTMLImageElement: class {},
  confirm: () => true,
  globalThis: null
};
context.globalThis = context;
let source = fs.readFileSync(path.join(root, "app.v2.js"), "utf8");
source += `\n;globalThis.__zeroHourTest={\n  getState:()=>state, setMode:m=>state.mode=m, getSession:()=>session, getMarkup:()=>app.innerHTML,\n  start, advance, pause, resume, complete, saveActive, backup, validateBackup, itemsFor,\n  setCounts:(wat,tat,ppdt,srt)=>{state.settings.watCount=wat;state.settings.tatCount=tat;state.settings.ppdtCount=ppdt;state.settings.srtCount=srt},\n  stored:()=>Object.fromEntries(stored)\n};`;
vm.createContext(context);
vm.runInContext(source, context, { filename: "app.v2.js" });

async function main() {
  await new Promise(resolve => setImmediate(resolve));
  const api = context.__zeroHourTest;
  assert.ok(api.getMarkup().includes("ZERO"), "app renders after loading banks");
  api.setCounts(1, 1, 1, 1);

  api.setMode("WAT"); api.start();
  assert.equal(api.getSession().phase, "item");
  api.pause(); assert.equal(api.getSession().paused, true);
  api.resume(); assert.equal(api.getSession().paused, false);
  api.complete(false); assert.equal(api.getSession().completed, true);

  api.setMode("TAT"); api.start();
  assert.equal(api.getSession().phase, "observe");
  assert.ok(api.getMarkup().includes("stimulus-image"), "TAT observation displays the picture");
  api.advance();
  assert.equal(api.getSession().phase, "story");
  assert.ok(api.getMarkup().includes("PICTURE HIDDEN"), "TAT writing phase hides picture");
  assert.ok(!api.getMarkup().includes("stimulus-image"), "TAT writing has no image element");
  api.complete(false);

  api.setMode("PPDT"); api.start(); assert.equal(api.getSession().phase, "observe");
  api.advance(); assert.equal(api.getSession().phase, "story");
  api.advance(); assert.equal(api.getSession().phase, "narrate");
  assert.ok(api.getMarkup().includes("PICTURE HIDDEN"), "PPDT narration keeps picture hidden");
  api.complete(false);

  api.setMode("SRT"); api.start(); assert.equal(api.getSession().phase, "item"); api.complete(false);
  api.setMode("WAT"); api.start(); api.pause(); api.saveActive("test interruption");
  assert.ok(api.stored()["zerohour-v2-active"], "interrupted session is persisted");
  assert.equal(api.validateBackup(api.backup()), "", "versioned backup validates");
  api.complete(true);
  console.log("PASSED runtime smoke: WAT, TAT hiding, PPDT phases, SRT, recovery snapshot, backup schema");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
