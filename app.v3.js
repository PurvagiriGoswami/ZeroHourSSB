/* ═══════════════════════════════════════════════════════════════
   ZeroHour v3 — Premium SSB Practice Suite
   Features: Dashboard, Practice/Exam modes, Analytics, Settings,
             Multiple practice sets, Particle FX, Theme system
   ═══════════════════════════════════════════════════════════════ */

const app = document.getElementById("app");
const announcer = document.getElementById("announcer");
const canvas = document.getElementById("particles");

/* ===== Storage Keys ===== */
const KEY = {
  state: "zerohour-v3-state", banks: "zerohour-v3-custom-banks",
  history: "zerohour-v3-history", active: "zerohour-v3-active",
  settings: "zerohour-v3-settings", theme: "zerohour-v3-theme"
};

/* ===== Defaults ===== */
const DEFAULT_SETTINGS = {
  watSeconds: 10, watCount: 60, tatObserve: 30, tatStory: 180, tatCount: 12,
  ppdtObserve: 30, ppdtStory: 240, ppdtNarrate: 60, ppdtCount: 1,
  srtSeconds: 20, srtCount: 60, interviewSeconds: 60, interviewCount: 20,
  interviewPriority: "ALL", interviewTopic: "All topics",
  shuffle: true, dedupe: true, beep: true, restEnabled: false, restSeconds: 5,
  theme: "midnight", fontSize: "medium", showParticles: true, showMotivation: true,
  autoFullscreen: false, keyboardShortcuts: true, soundVolume: 80,
  showStreak: true, dailyGoal: 3
};

const EXAM_TIMINGS = {
  WAT: { seconds: 15, count: 60 },
  TAT: { observe: 30, story: 240, count: 11 },
  PPDT: { observe: 30, story: 60, narrate: 60, count: 1 },
  SRT: { seconds: 30, count: 60 }
};

const MODES = [
  { id: "WAT", short: "WAT", name: "Word Association Test", icon: "◉", desc: "One stimulus word at a time", color: "accent" },
  { id: "TAT", short: "TAT", name: "Thematic Apperception Test", icon: "▧", desc: "Picture observation + story writing", color: "purple" },
  { id: "PPDT", short: "PPDT", name: "Picture Perception & Discussion", icon: "▣", desc: "Observe, write, then narrate", color: "blue" },
  { id: "SRT", short: "SRT", name: "Situation Reaction Test", icon: "☷", desc: "Rapid responses to situations", color: "gold" },
  { id: "INTERVIEW", short: "TECH", name: "Technical Interview", icon: "⌘", desc: "CSE interview prompts", color: "red" }
];

const MOTIVATIONAL_QUOTES = [
  { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "— SSB Motto" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "— Winston Churchill" },
  { text: "A warrior's greatest weapon is his willpower and confidence.", author: "— Field Marshal Sam Manekshaw" },
  { text: "The only way to do great work is to love what you do.", author: "— Steve Jobs" },
  { text: "Difficulty is the nurse of greatness — a harsh nurse who rocks her children roughly.", author: "— William Cullen Bryant" },
  { text: "Leadership is not about being in charge. It's about taking care of those in your charge.", author: "— Simon Sinek" },
  { text: "In the middle of difficulty lies opportunity.", author: "— Albert Einstein" },
  { text: "The SSB tests not your knowledge, but your personality, your character, and your courage.", author: "— SSB Guidebook" }
];

/* ===== State ===== */
let banks, state, settings, customBanks = {}, history = [], session = null, pendingRecovery = null;
let currentView = "dashboard", modal = null, timer = null, endsAt = null;
let toast = "", examMode = false, materialManifest = null;
let libraryQuery = "", libraryCategory = "All categories", reviewId = null, audioContext = null;
let activeSetFilter = "ALL";

/* ===== Utility ===== */
const $ = (s, r = document) => r.querySelector(s);
const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = v => { const s = Math.max(0, Math.floor(Number(v) || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`; };
const dur = v => v >= 60 ? `${Math.floor(v / 60)}m${v % 60 ? ` ${v % 60}s` : ""}` : `${v}s`;
const uid = p => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const canonical = v => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
const imageMode = m => m === "TAT" || m === "PPDT";
const modeInfo = () => MODES.find(m => m.id === state.mode) || MODES[0];
const prompt = (item, m) => m === "INTERVIEW" ? item?.question || "" : imageMode(m) ? item?.title || "" : typeof item === "string" ? item : item?.text || "";
const say = msg => { if (announcer) announcer.textContent = msg; };

function applyTheme(t = settings?.theme) {
  document.documentElement.setAttribute("data-theme", t || "midnight");
}
function applyFontSize(s = settings?.fontSize) {
  document.documentElement.setAttribute("data-font-size", s || "medium");
}

/* ===== Storage ===== */
function load(key, fb) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { toast = "Storage full. Export a backup."; return false; } }
function persist() { save(KEY.state, state); save(KEY.banks, customBanks); save(KEY.history, history.slice(0, 100)); save(KEY.settings, settings); }
function notice(msg) { toast = msg; say(msg); render(); setTimeout(() => { if (toast === msg) { toast = ""; render(); } }, 4500); }

function setupSaved() {
  // Try v3 first, fall back to v2, then v1
  const saved = load(KEY.state, load("zerohour-v2-state", load("zerohour-full-settings", null)));
  state = { version: 3, mode: "WAT", bankIds: {}, ...(saved || {}), bankIds: { ...(saved?.bankIds || {}) } };
  settings = { ...DEFAULT_SETTINGS, ...(load(KEY.settings, null) || {}) };
  customBanks = load(KEY.banks, load("zerohour-v2-custom-banks", load("zerohour-custom-banks", {}))) || {};
  history = load(KEY.history, load("zerohour-v2-history", load("zerohour-session-history", []))) || [];
  if (!Array.isArray(history)) history = [];
  pendingRecovery = load(KEY.active, load("zerohour-v2-active", null));
  examMode = false;
  applyTheme();
  applyFontSize();
}

function saveActive(reason = "interrupted") {
  if (!session || session.completed) return;
  if (!session.paused && endsAt) session.remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  save(KEY.active, { ...session, paused: true, activeStartedAt: null, savedAt: new Date().toISOString(), recoveryReason: reason });
}
function clearActive() { try { localStorage.removeItem(KEY.active); } catch {} }

/* ===== Particle System ===== */
function initParticles() {
  if (!canvas || !settings.showParticles) { if (canvas) canvas.style.display = "none"; return; }
  canvas.style.display = "block";
  const ctx = canvas.getContext("2d");
  let particles = [], w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 0.5, a: Math.random() * 0.4 + 0.1,
      color: ["0,229,195", "180,140,255", "100,181,246"][Math.floor(Math.random() * 3)]
    });
  }

  function animate() {
    if (!settings.showParticles) { ctx.clearRect(0, 0, w, h); return; }
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${p.a})`;
      ctx.fill();
    });
    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,229,195,${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
}

/* ===== Bank system ===== */
function defaultBank(m) {
  if (m === "WAT") return "wat-set-1";
  if (m === "SRT") return "srt-set-1";
  if (m === "TAT") return "tat-set-1";
  if (m === "PPDT") return "ppdt-set-1";
  return "cse-interview";
}
function selectedBank(m = state.mode) { return state.bankIds?.[m] || defaultBank(m); }

function builtInItems(mode, id) {
  if (mode === "WAT") {
    const master = banks.watBanks?.[0]?.items || [];
    if (id === "wat-set-1") return master.slice(0, 60).map((t, i) => ({ id: `wat-s1-${i + 1}`, text: String(t), source: "WAT Exam Set 1", category: "WAT" }));
    if (id === "wat-set-2") return master.slice(60, 120).map((t, i) => ({ id: `wat-s2-${i + 1}`, text: String(t), source: "WAT Exam Set 2", category: "WAT" }));
    if (id === "wat-set-3") return master.slice(120, 180).map((t, i) => ({ id: `wat-s3-${i + 1}`, text: String(t), source: "WAT Exam Set 3", category: "WAT" }));
    if (id === "wat-set-4") return master.slice(180, 240).map((t, i) => ({ id: `wat-s4-${i + 1}`, text: String(t), source: "WAT Exam Set 4", category: "WAT" }));
    if (id === "wat-set-5") return master.slice(240, 300).map((t, i) => ({ id: `wat-s5-${i + 1}`, text: String(t), source: "WAT Exam Set 5", category: "WAT" }));
    const b = banks.watBanks.find(x => x.id === id) || banks.watBanks[0];
    return b.items.map((t, i) => ({ id: `${b.id}-${i + 1}`, text: String(t), source: b.source, category: "WAT" }));
  }
  if (mode === "SRT") {
    if (id === "srt-set-1") {
      const b = banks.srtBanks.find(x => x.id === "srt-set-1-file-labelled-set-4") || banks.srtBanks[1] || banks.srtBanks[0];
      return b.items.slice(0, 60).map((t, i) => ({ id: `srt-s1-${i + 1}`, text: String(t), source: "SRT Exam Set 1", category: "SRT" }));
    }
    if (id === "srt-set-2") {
      const b = banks.srtBanks.find(x => x.id === "srt-set-2-file-labelled-practice-set-3") || banks.srtBanks[2] || banks.srtBanks[0];
      return b.items.slice(0, 60).map((t, i) => ({ id: `srt-s2-${i + 1}`, text: String(t), source: "SRT Exam Set 2", category: "SRT" }));
    }
    if (id === "srt-set-3") {
      const b = banks.srtBanks.find(x => x.id === "srt-set-3-file-labelled-set2") || banks.srtBanks[3] || banks.srtBanks[0];
      return b.items.slice(0, 60).map((t, i) => ({ id: `srt-s3-${i + 1}`, text: String(t), source: "SRT Exam Set 3", category: "SRT" }));
    }
    if (id === "srt-set-4") {
      const b = banks.srtBanks[0];
      return b.items.slice(0, 60).map((t, i) => ({ id: `srt-s4-${i + 1}`, text: String(t), source: "SRT Exam Set 4", category: "SRT" }));
    }
    const b = banks.srtBanks.find(x => x.id === id) || banks.srtBanks[0];
    return b.items.map((t, i) => ({ id: `${b.id}-${i + 1}`, text: String(t), source: b.source, category: "SRT" }));
  }
  if (mode === "TAT") {
    if (id.startsWith("tat-set-")) {
      const s = parseInt(id.replace("tat-set-", ""), 10) || 1;
      const startIdx = (s - 1) * 11;
      const items = [];
      for (let i = 0; i < 11; i++) {
        const picNum = ((startIdx + i) % (banks.tatCount || 467)) + 1;
        const n = String(picNum).padStart(3, "0");
        items.push({ id: `tat-${s}-${i + 1}`, title: `Picture ${i + 1} (Slide ${n})`, source: `TAT Exam Set ${s}`, page: picNum, image: `tat/${n}.jpg`, thumbnail: `tat/${n}.jpg`, category: "TAT" });
      }
      items.push({ id: `tat-${s}-blank`, title: `Picture 12 (Blank Slide)`, source: "SSB Official TAT Protocol", isBlank: true, category: "TAT", text: "BLANK SLIDE: Imagine a character, setting, and situation of your own choice. Conceive a problem and write your story around it." });
      return items;
    }
    return Array.from({ length: Number(banks.tatCount) || 0 }, (_, i) => { const n = String(i + 1).padStart(3, "0"); return { id: `tat-${n}`, title: `Picture ${n}`, source: "TAT Picture Bank", page: i + 1, image: `tat/${n}.jpg`, thumbnail: `tat/${n}.jpg`, category: "TAT and PPDT" }; });
  }
  if (mode === "PPDT") {
    if (id.startsWith("ppdt-set-")) {
      const ppdtMap = {
        "ppdt-set-1": { pic: 1, title: "PPDT Set 1 — Rural & Social Welfare (Picture 001)" },
        "ppdt-set-2": { pic: 4, title: "PPDT Set 2 — Accident & Emergency Rescue (Picture 004)" },
        "ppdt-set-3": { pic: 11, title: "PPDT Set 3 — Youth & Adventure Challenge (Picture 011)" },
        "ppdt-set-4": { pic: 18, title: "PPDT Set 4 — Academic & Career Decision (Picture 018)" },
        "ppdt-set-5": { pic: 25, title: "PPDT Set 5 — Workplace & Team Dynamics (Picture 025)" },
        "ppdt-set-6": { pic: 32, title: "PPDT Set 6 — Community Dispute Resolution (Picture 032)" },
        "ppdt-set-7": { pic: 41, title: "PPDT Set 7 — Environment & Flood Relief (Picture 041)" },
        "ppdt-set-8": { pic: 50, title: "PPDT Set 8 — Sports & Leadership (Picture 050)" }
      };
      const info = ppdtMap[id] || { pic: 1, title: "PPDT Screening Picture" };
      const n = String(info.pic).padStart(3, "0");
      return [{ id: `ppdt-${n}`, title: info.title, source: "PPDT Screening Bank", page: info.pic, image: `tat/${n}.jpg`, thumbnail: `tat/${n}.jpg`, category: "PPDT" }];
    }
    return Array.from({ length: Number(banks.tatCount) || 0 }, (_, i) => { const n = String(i + 1).padStart(3, "0"); return { id: `ppdt-${n}`, title: `Picture ${n}`, source: "TAT/PPDT Picture Bank", page: i + 1, image: `tat/${n}.jpg`, thumbnail: `tat/${n}.jpg`, category: "TAT and PPDT" }; });
  }
  if (mode === "INTERVIEW") {
    return banks.interviewItems.map((x, i) => ({ id: `cse-${i + 1}`, question: x.question, answer: x.answer, topic: x.topic || "Uncategorised", priority: x.priority || "P2", source: "AAB CSE Tech Interview", category: "Technical interview" }));
  }
  return [];
}

function normalise(v, m, bank, i) {
  const shared = { id: v?.id || `${bank.id}-${i + 1}`, source: v?.source || bank.source || "Custom", page: v?.page || null, category: v?.category || m, isBlank: Boolean(v?.isBlank) };
  if (m === "INTERVIEW") return { ...shared, question: String(v?.question || v?.prompt || v?.text || "").trim(), answer: String(v?.answer || "").trim(), topic: v?.topic || "Custom", priority: v?.priority || "P2" };
  if (imageMode(m)) return { ...shared, title: String(v?.title || v?.prompt || "Custom picture").trim(), image: v?.image || "", thumbnail: v?.thumbnail || v?.image || "" };
  return { ...shared, text: String(typeof v === "string" ? v : v?.text || v?.prompt || v?.word || "").trim() };
}
function findCustom(m, id) { return (customBanks[m] || []).find(b => b.id === id); }
function itemsFor(m, id) { const c = findCustom(m, id); return c ? (c.items || []).map((x, i) => normalise(x, m, c, i)).filter(x => prompt(x, m)) : builtInItems(m, id); }

function optionsFor(m) {
  let orig = [];
  if (m === "WAT") {
    orig = [
      { id: "wat-set-1", title: "WAT Exam Set 1 (60 Words — Officer Qualities)", source: "SSB WAT Master Bank", count: 60, tag: "Exam Set", original: true },
      { id: "wat-set-2", title: "WAT Exam Set 2 (60 Words — Emotional Stability)", source: "SSB WAT Master Bank", count: 60, tag: "Exam Set", original: true },
      { id: "wat-set-3", title: "WAT Exam Set 3 (60 Words — Leadership & Action)", source: "SSB WAT Master Bank", count: 60, tag: "Exam Set", original: true },
      { id: "wat-set-4", title: "WAT Exam Set 4 (60 Words — Social & Team Dynamics)", source: "SSB WAT Master Bank", count: 60, tag: "Exam Set", original: true },
      { id: "wat-set-5", title: "WAT Exam Set 5 (60 Words — Crisis & Resilience)", source: "SSB WAT Master Bank", count: 60, tag: "Exam Set", original: true },
      ...(banks.watBanks || []).map(b => ({ id: b.id, title: b.title, source: b.source, count: b.items.length, tag: "Word Bank", original: true }))
    ];
  }
  if (m === "SRT") {
    orig = [
      { id: "srt-set-1", title: "SRT Exam Set 1 (60 Situations — Crisis Response)", source: "Official SRT Collection 1", count: 60, tag: "Exam Set", original: true },
      { id: "srt-set-2", title: "SRT Exam Set 2 (60 Situations — Leadership & Duty)", source: "Official SRT Collection 2", count: 60, tag: "Exam Set", original: true },
      { id: "srt-set-3", title: "SRT Exam Set 3 (60 Situations — Physical Courage)", source: "Official SRT Collection 3", count: 60, tag: "Exam Set", original: true },
      { id: "srt-set-4", title: "SRT Exam Set 4 (60 Situations — Practical Decision)", source: "180 Situation Collection", count: 60, tag: "Exam Set", original: true },
      ...(banks.srtBanks || []).map(b => ({ id: b.id, title: b.title, source: b.source, count: b.items.length, note: b.note, tag: "SRT Collection", original: true }))
    ];
  }
  if (m === "TAT") {
    const sets = [];
    for (let s = 1; s <= 8; s++) {
      const startPic = (s - 1) * 11 + 1;
      const endPic = s * 11;
      sets.push({
        id: `tat-set-${s}`,
        title: `TAT Exam Set ${s} (11 Pictures + 1 Blank Slide: ${String(startPic).padStart(3, "0")}–${String(endPic).padStart(3, "0")})`,
        source: "Official SSB TAT Protocol",
        count: 12,
        tag: "11+Blank Slide",
        original: true
      });
    }
    sets.push({ id: "tat-pictures", title: `TAT Complete Picture Bank (${banks.tatCount} Pictures)`, source: "TAT Picture Bank", count: banks.tatCount, tag: "Full Bank", original: true });
    orig = sets;
  }
  if (m === "PPDT") {
    const ppdtScenes = [
      { id: "ppdt-set-1", theme: "Rural & Social Welfare (Picture 001)" },
      { id: "ppdt-set-2", theme: "Accident & Emergency Rescue (Picture 004)" },
      { id: "ppdt-set-3", theme: "Youth & Adventure Challenge (Picture 011)" },
      { id: "ppdt-set-4", theme: "Academic & Career Dilemma (Picture 018)" },
      { id: "ppdt-set-5", theme: "Workplace & Team Dynamics (Picture 025)" },
      { id: "ppdt-set-6", theme: "Community Dispute Resolution (Picture 032)" },
      { id: "ppdt-set-7", theme: "Environment & Flood Relief (Picture 041)" },
      { id: "ppdt-set-8", theme: "Sports & Leadership Under Pressure (Picture 050)" }
    ];
    orig = ppdtScenes.map(s => ({
      id: s.id,
      title: `PPDT Set — ${s.theme}`,
      source: "Stage 1 Screening Bank",
      count: 1,
      tag: "Stage 1 Screening",
      original: true
    }));
    orig.push({ id: "tat-pictures", title: `PPDT Complete Picture Bank (${banks.tatCount} Pictures)`, source: "TAT/PPDT Picture Bank", count: banks.tatCount, tag: "Full Bank", original: true });
  }
  if (m === "INTERVIEW") {
    orig = [{ id: "cse-interview", title: `CSE Interview (${banks.interviewItems.length})`, source: "AAB CSE Tech Interview", count: banks.interviewItems.length, tag: "Technical", original: true }];
  }
  return [...orig, ...(customBanks[m] || []).map(b => ({ ...b, count: (b.items || []).length, tag: "Custom", original: false }))];
}

function unique(items, m) { const seen = new Set(), kept = []; let dups = 0; for (const x of items) { const k = canonical(imageMode(m) ? (x.isBlank ? "blank-slide" : x.image || x.title) : prompt(x, m)); if (seen.has(k)) dups++; else { seen.add(k); kept.push(x); } } return { kept, duplicates: dups }; }
function shuffle(items) { const c = [...items]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; }

function phaseSeconds(m, phase) {
  const s = examMode ? getExamSettings(m) : settings;
  if (phase === "rest") return settings.restSeconds;
  if (m === "WAT") return s.watSeconds || s.seconds || 15;
  if (m === "SRT") return s.srtSeconds || s.seconds || 30;
  if (m === "INTERVIEW") return s.interviewSeconds || 60;
  if (m === "TAT") return phase === "observe" ? (s.tatObserve || s.observe || 30) : (s.tatStory || s.story || 240);
  return phase === "observe" ? (s.ppdtObserve || s.observe || 30) : phase === "story" ? (s.ppdtStory || s.story || 60) : (s.ppdtNarrate || s.narrate || 60);
}
function getExamSettings(m) {
  const e = EXAM_TIMINGS[m] || {};
  return {
    watSeconds: e.seconds || 15, srtSeconds: e.seconds || 30,
    tatObserve: e.observe || 30, tatStory: e.story || 240, tatCount: e.count || 12,
    ppdtObserve: e.observe || 30, ppdtStory: e.story || 60, ppdtNarrate: e.narrate || 60, ppdtCount: e.count || 1,
    interviewSeconds: 60
  };
}
function firstPhase(m) { return imageMode(m) ? "observe" : "item"; }
function presets(m) { return m === "WAT" ? [5, 10, 15] : m === "SRT" ? [15, 20, 30] : m === "INTERVIEW" ? [30, 60, 90] : m === "TAT" ? [120, 180, 240] : [180, 240, 300]; }

/* ===== Practice Sets ===== */
function getPracticeSets() {
  const sets = [];
  ["WAT", "TAT", "PPDT", "SRT", "INTERVIEW"].forEach(m => {
    const mi = MODES.find(x => x.id === m);
    optionsFor(m).forEach(opt => {
      sets.push({
        mode: m,
        id: opt.id,
        title: opt.title,
        source: opt.source || "Official SSB",
        count: opt.count,
        icon: mi?.icon || "◎",
        colorClass: m.toLowerCase(),
        tag: opt.tag || (m === "WAT" ? "15s / word" : m === "TAT" ? "11 + Blank" : m === "SRT" ? "30s / SRT" : m === "PPDT" ? "Screening" : "Interview")
      });
    });
  });
  return sets;
}

/* ===== Analytics helpers ===== */
function getAnalytics() {
  const sessions = history.filter(x => x.endedAt);
  const totalTime = sessions.reduce((a, x) => a + Number(x.elapsed || 0), 0);
  const totalPrompts = sessions.reduce((a, x) => a + Number(x.shownCount || x.items?.length || 0), 0);
  const byMode = {};
  MODES.forEach(m => { byMode[m.id] = sessions.filter(x => x.mode === m.id); });
  const days = [...new Set(sessions.map(x => new Date(x.endedAt || x.startedAt).toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0, cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  for (const d of days) { const date = new Date(`${d}T00:00:00`); if (date.getTime() === cursor.getTime()) { streak++; cursor.setDate(cursor.getDate() - 1); } else if (date < cursor) break; }
  // Heatmap: last 35 days
  const heatmap = [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  for (let i = 34; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = sessions.filter(x => (x.endedAt || x.startedAt || "").startsWith(key)).length;
    heatmap.push({ date: key, count, level: Math.min(5, count) });
  }
  // Weekly data for bar chart
  const weekData = {};
  MODES.forEach(m => { weekData[m.id] = 0; });
  const weekAgo = Date.now() - 7 * 86400000;
  sessions.filter(x => new Date(x.endedAt || x.startedAt).getTime() > weekAgo).forEach(x => { if (weekData[x.mode] !== undefined) weekData[x.mode]++; });

  const ratings = sessions.filter(x => x.selfRating).map(x => Number(x.selfRating));
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

  return { sessions, totalTime, totalPrompts, byMode, streak, heatmap, weekData, avgRating, days };
}

/* ===== Main Render ===== */
function render() {
  if (!banks) return;
  const mi = modeInfo();
  app.innerHTML = `
    <aside class="sidebar" aria-label="ZeroHour navigation">
      <div class="brand"><div class="brand-shield">⬡</div><div><div class="brand-name">ZERO<span>HOUR</span></div><div class="brand-caption">SSB PRACTICE SUITE</div></div></div>
      <div class="side-label">NAVIGATION</div>
      <nav class="nav-list">
        ${navView("dashboard", "◫", "Dashboard", "Home & overview")}
        ${navView("practice", "◷", "Practice", "Training sessions")}
        ${navView("sets", "▤", "Practice Sets", "Browse all sets")}
        ${navView("analytics", "◎", "Analytics", "Track progress")}
        ${navView("history", "▥", "History", "Past sessions")}
        ${navView("settings-page", "⚙", "Settings", "Customize app")}
      </nav>
      <div class="sidebar-divider"></div>
      <div class="side-label">TEST MODES</div>
      <nav class="nav-list">${MODES.map(x => navMode(x)).join("")}</nav>
      <div class="sidebar-bottom"><span class="online-dot"></span> ${examMode ? "EXAM MODE" : "PRACTICE MODE"}<br/><small>All data stored locally.</small></div>
    </aside>
    <main class="main" id="mainContent" tabindex="-1">
      ${header(mi)}
      ${currentView === "dashboard" ? dashboardView() :
        currentView === "practice" ? (session ? sessionView() : setupView()) :
        currentView === "sets" ? setsView() :
        currentView === "analytics" ? analyticsView() :
        currentView === "history" ? historyView() :
        currentView === "settings-page" ? settingsPageView() :
        currentView === "library" ? libraryView() : setupView()}
      <footer class="footer"><span>ZEROHOUR // SSB PRACTICE SUITE</span><span>Built by <a href="https://github.com/PurvagiriGoswami" target="_blank">PurvagiriGoswami</a> · v3.0</span></footer>
    </main>
    ${toast ? `<div class="toast" role="status">${esc(toast)}</div>` : ""}
    ${modal ? modalView() : ""}
  `;
}

function navMode(e) { return `<button class="nav-item ${state.mode === e.id && currentView === "practice" ? "active" : ""}" data-action="mode" data-mode="${e.id}"><span class="nav-symbol">${e.icon}</span><span class="nav-copy"><b>${e.short}</b><small>${e.name}</small></span><span class="nav-arrow">›</span></button>`; }
function navView(v, icon, title, detail) { return `<button class="nav-item ${currentView === v ? "active" : ""}" data-action="view" data-view="${v}"><span class="nav-symbol">${icon}</span><span class="nav-copy"><b>${title}</b><small>${detail}</small></span></button>`; }
function header(mi) {
  const titles = { dashboard: "Dashboard", practice: session ? (session.completed ? "Session Review" : "Live Practice") : mi.name, sets: "Practice Sets", analytics: "Analytics", history: "Session History", "settings-page": "Settings", library: "Material Library" };
  const subtitles = { dashboard: "Welcome back, Warrior!", practice: session && !session.completed ? "Focus on your paper." : mi.desc, sets: "Browse and start any practice set.", analytics: "Track your progress over time.", history: "Review completed sessions.", "settings-page": "Customize your experience.", library: "Source materials and banks." };
  return `<header class="topbar"><div><div class="breadcrumb">ZEROHOUR / ${esc((currentView || "").toUpperCase().replace("-PAGE", ""))} / <b>${esc(mi.short)}</b></div><h1>${esc(titles[currentView] || mi.name)}</h1><p>${esc(subtitles[currentView] || "")}</p></div><div class="top-actions">${examMode ? '<span class="exam-badge">🔴 EXAM MODE</span>' : '<span class="practice-badge">● PRACTICE</span>'}<button class="btn btn-quiet" data-action="toggle-exam">${examMode ? "Switch to Practice" : "Switch to Exam Mode"}</button><button class="btn btn-quiet" data-action="fullscreen">⛶</button></div></header>`;
}
function stat(label, value, note) { return `<div class="stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-number">${esc(String(value))}</div><div class="stat-note">${esc(note)}</div></div>`; }

/* ===== DASHBOARD VIEW ===== */
function dashboardView() {
  const a = getAnalytics();
  const quote = MOTIVATIONAL_QUOTES[Math.floor(Date.now() / 86400000) % MOTIVATIONAL_QUOTES.length];
  const todaySessions = a.sessions.filter(x => (x.endedAt || x.startedAt || "").startsWith(new Date().toISOString().slice(0, 10))).length;
  const goalProgress = Math.min(100, Math.round(todaySessions / settings.dailyGoal * 100));

  return `<section class="dashboard">
    <div class="hero-section">
      <div class="hero-greeting"><span class="pulse"></span> READY FOR TRAINING</div>
      <h2 class="hero-title">Welcome to <span>ZeroHour</span></h2>
      <p class="hero-subtitle">Your personal SSB practice command center. Track your progress, build consistency, and ace the Services Selection Board.</p>
      <div class="quick-actions">
        <button class="quick-action" data-action="quick-start" data-mode="WAT"><div class="qa-icon">◉</div>Quick WAT</button>
        <button class="quick-action" data-action="quick-start" data-mode="TAT"><div class="qa-icon">▧</div>Quick TAT</button>
        <button class="quick-action" data-action="quick-start" data-mode="SRT"><div class="qa-icon">☷</div>Quick SRT</button>
        <button class="quick-action" data-action="quick-start" data-mode="PPDT"><div class="qa-icon">▣</div>Quick PPDT</button>
      </div>
    </div>

    ${settings.showMotivation ? `<div class="motivational"><span class="motivational-icon">💡</span><div><div class="motivational-text">"${esc(quote.text)}"</div><div class="motivational-author">${esc(quote.author)}</div></div></div>` : ""}

    <div class="dash-stats">
      <div class="dash-stat"><div class="dash-stat-icon">🎯</div><div class="dash-stat-value">${todaySessions}</div><div class="dash-stat-label">SESSIONS TODAY</div></div>
      <div class="dash-stat"><div class="dash-stat-icon">🔥</div><div class="dash-stat-value">${a.streak}</div><div class="dash-stat-label">DAY STREAK</div></div>
      <div class="dash-stat"><div class="dash-stat-icon">⏱️</div><div class="dash-stat-value">${fmt(a.totalTime)}</div><div class="dash-stat-label">TOTAL PRACTICE</div></div>
      <div class="dash-stat"><div class="dash-stat-icon">📝</div><div class="dash-stat-value">${a.totalPrompts.toLocaleString()}</div><div class="dash-stat-label">PROMPTS SEEN</div></div>
    </div>

    ${settings.showStreak && a.streak > 0 ? `<div class="streak-badge"><span class="fire">🔥</span> ${a.streak} day streak — keep it going!</div>` : ""}

    <div class="stats-grid" style="margin:24px 0">
      <div class="chart-container"><div class="chart-title">DAILY GOAL PROGRESS</div>
        <div class="progress-ring"><svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="40"/><circle class="ring-fill" cx="50" cy="50" r="40" stroke-dasharray="${2 * Math.PI * 40}" stroke-dashoffset="${2 * Math.PI * 40 * (1 - goalProgress / 100)}"/></svg><div class="ring-label">${goalProgress}%<small>${todaySessions}/${settings.dailyGoal}</small></div></div>
      </div>
      <div class="chart-container"><div class="chart-title">THIS WEEK BY MODE</div>
        <div class="bar-chart">${MODES.filter(m => m.id !== "INTERVIEW").map(m => { const v = a.weekData[m.id] || 0; const maxV = Math.max(1, ...Object.values(a.weekData)); return `<div class="bar-col"><div class="bar-value">${v}</div><div class="bar ${m.id.toLowerCase()}" style="height:${Math.max(4, v / maxV * 100)}%"></div><div class="bar-label">${m.short}</div></div>`; }).join("")}</div>
      </div>
      <div class="chart-container"><div class="chart-title">ACTIVITY HEATMAP (35 DAYS)</div>
        <div class="heatmap">${a.heatmap.map(h => `<div class="heat-cell heat-${h.level}" title="${h.date}: ${h.count} sessions"></div>`).join("")}</div>
        <div class="heatmap-legend"><span>Less</span>${[0,1,2,3,4,5].map(l => `<div class="heat-swatch heat-${l}"></div>`).join("")}<span>More</span></div>
      </div>
    </div>

    <div class="mode-cards">
      ${MODES.map(m => {
        const count = m.id === "WAT" ? banks.watBanks.reduce((a, b) => a + b.items.length, 0) :
          m.id === "SRT" ? banks.srtBanks.reduce((a, b) => a + b.items.length, 0) :
          m.id === "INTERVIEW" ? banks.interviewItems.length : banks.tatCount;
        const sessions = a.byMode[m.id]?.length || 0;
        return `<div class="mode-card ${m.id.toLowerCase()}" data-action="mode" data-mode="${m.id}">
          <div class="mode-card-icon">${m.icon}</div>
          <div class="mode-card-name">${esc(m.name)}</div>
          <div class="mode-card-desc">${esc(m.desc)}</div>
          <div class="mode-card-meta"><span class="mode-card-chip">${count} prompts</span><span class="mode-card-chip">${sessions} sessions</span></div>
        </div>`;
      }).join("")}
    </div>

    ${a.sessions.length ? `
    <div class="practice-sets-title">Recent Sessions</div>
    <div class="recent-activity">${a.sessions.slice(0, 5).map(s => `<div class="activity-row" data-action="review" data-id="${esc(s.id)}">
      <div class="activity-dot ${s.mode.toLowerCase()}"></div>
      <div class="activity-info"><b>${esc(s.bankTitle || `${s.mode} session`)}</b><small>${new Date(s.endedAt || s.startedAt).toLocaleDateString()}</small></div>
      <div class="activity-time">${fmt(s.elapsed || 0)}</div>
    </div>`).join("")}</div>
    ` : ""}
  </section>`;
}

/* ===== PRACTICE SETS VIEW ===== */
function setsView() {
  const sets = getPracticeSets();
  const filter = activeSetFilter || "ALL";
  const filtered = filter === "ALL" ? sets : sets.filter(s => s.mode === filter);

  return `<section class="dashboard">
    <div class="section-heading">
      <div>
        <div class="eyebrow">PRACTICE MATERIAL</div>
        <h2>All Practice Sets</h2>
        <p>Curated official and specialized sets for SSB selection testing. Choose Practice Mode or Real SSB Exam Mode.</p>
      </div>
      <button class="btn btn-secondary" data-action="import">＋ Import custom set</button>
    </div>

    <div class="set-filters">
      <button class="set-filter-btn ${filter === "ALL" ? "active" : ""}" data-action="set-filter" data-filter="ALL">All Sets (${sets.length})</button>
      <button class="set-filter-btn ${filter === "WAT" ? "active" : ""}" data-action="set-filter" data-filter="WAT">◉ WAT Sets (${sets.filter(s => s.mode === "WAT").length})</button>
      <button class="set-filter-btn ${filter === "TAT" ? "active" : ""}" data-action="set-filter" data-filter="TAT">▧ TAT Sets (${sets.filter(s => s.mode === "TAT").length})</button>
      <button class="set-filter-btn ${filter === "PPDT" ? "active" : ""}" data-action="set-filter" data-filter="PPDT">▣ PPDT Screening (${sets.filter(s => s.mode === "PPDT").length})</button>
      <button class="set-filter-btn ${filter === "SRT" ? "active" : ""}" data-action="set-filter" data-filter="SRT">☷ SRT Sets (${sets.filter(s => s.mode === "SRT").length})</button>
      <button class="set-filter-btn ${filter === "INTERVIEW" ? "active" : ""}" data-action="set-filter" data-filter="INTERVIEW">⌘ Tech Interview (${sets.filter(s => s.mode === "INTERVIEW").length})</button>
    </div>

    <div class="practice-sets">
      <div class="set-grid">
        ${filtered.map(s => `
          <div class="set-card">
            <div class="set-card-top">
              <div class="set-card-icon ${s.colorClass}">${s.icon}</div>
              <div class="set-card-info">
                <b>${esc(s.title)}</b>
                <small>${esc(s.source)}</small>
                <div class="set-card-tags">
                  <span class="set-badge">${s.count} ${s.mode === "WAT" ? "words" : s.mode === "TAT" ? "slides" : s.mode === "PPDT" ? "screening" : s.mode === "SRT" ? "situations" : "prompts"}</span>
                  <span class="set-badge ${s.mode.toLowerCase()}">${esc(s.tag || s.mode)}</span>
                </div>
              </div>
            </div>
            <div class="set-card-actions">
              <button class="set-action-btn set-action-practice" data-action="start-set" data-mode="${s.mode}" data-bank="${esc(s.id)}">▶ Practice</button>
              <button class="set-action-btn set-action-exam" data-action="start-exam-set" data-mode="${s.mode}" data-bank="${esc(s.id)}">🔴 Exam Mode</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  </section>`;
}

/* ===== SETUP VIEW ===== */
function setupView() {
  const mi = modeInfo(), opts = optionsFor(state.mode), sel = selectedBank(), bank = opts.find(x => x.id === sel) || opts[0];
  const s = examMode ? getExamSettings(state.mode) : settings;
  const count = state.mode === "WAT" ? (s.watCount || settings.watCount) : state.mode === "SRT" ? (s.srtCount || settings.srtCount) : state.mode === "TAT" ? (s.tatCount || settings.tatCount) : state.mode === "PPDT" ? (s.ppdtCount || settings.ppdtCount) : (s.interviewCount || settings.interviewCount);
  const sec = state.mode === "WAT" ? (s.watSeconds || settings.watSeconds) : state.mode === "SRT" ? (s.srtSeconds || settings.srtSeconds) : state.mode === "TAT" ? (s.tatStory || settings.tatStory) : state.mode === "PPDT" ? (s.ppdtStory || settings.ppdtStory) : (s.interviewSeconds || settings.interviewSeconds);
  const est = state.mode === "TAT" ? count * ((s.tatObserve || settings.tatObserve) + sec) : state.mode === "PPDT" ? count * ((s.ppdtObserve || settings.ppdtObserve) + sec + (s.ppdtNarrate || settings.ppdtNarrate)) : count * sec;
  const topics = [...new Set((banks.interviewItems || []).map(x => x.topic))];
  const msg = imageMode(state.mode) ? "Picture visible only during observation phase." : state.mode === "WAT" ? "Write a response on paper before the next word." : state.mode === "SRT" ? "Respond practically and concisely on paper." : "Answer aloud or on paper.";

  return `<section class="dashboard">
    ${examMode ? `<div class="exam-mode-banner"><span class="exam-badge">EXAM MODE</span><div><b>Real SSB Exam Timing Active</b><small>Timings locked to official SSB exam parameters. No pausing allowed.</small></div></div>` : ""}
    <section class="stats-grid">${stat("AVAILABLE PROMPTS", String(bank?.count || 0), bank?.title || "No bank")}${stat("PACE", `${dur(sec)} / item`, examMode ? "SSB exam timing" : "editable")}${stat("ESTIMATED RUN", fmt(est), `${count} prompts`)}</section>
    <section class="setup-card"><div class="section-heading"><div><div class="eyebrow">${examMode ? "SSB EXAM SIMULATION" : "MISSION CONFIGURATION"}</div><h2>${examMode ? "Real SSB exam run" : "Build your practice run"}</h2><p>${esc(msg)}</p></div><span class="lock-chip">${examMode ? "🔴 EXAM LOCKED" : "◈ PRACTICE MODE"}</span></div>
      <div class="setup-grid"><div class="setup-form">
        <label class="field"><span>Question bank</span><select id="bankSelect">${opts.map(o => `<option value="${esc(o.id)}" ${o.id === sel ? "selected" : ""}>${esc(o.title)}${o.original ? " · original" : " · custom"}</option>`).join("")}</select><small>${esc(bank?.source || "")}</small></label>
        ${state.mode === "INTERVIEW" ? `<div class="field-grid two"><label class="field"><span>Priority</span><select id="interviewPriority"><option value="ALL" ${settings.interviewPriority === "ALL" ? "selected" : ""}>All</option>${["P0", "P1", "P2", "P3"].map(v => `<option ${settings.interviewPriority === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="field"><span>Topic</span><select id="interviewTopic"><option ${settings.interviewTopic === "All topics" ? "selected" : ""}>All topics</option>${topics.map(t => `<option ${settings.interviewTopic === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>` : ""}
        ${!examMode ? `<div class="field-grid two"><label class="field"><span>Items in run</span><input id="itemCount" type="number" min="1" max="5000" value="${count}"/></label><label class="field"><span>${state.mode === "WAT" ? "Sec/word" : state.mode === "SRT" ? "Sec/situation" : state.mode === "INTERVIEW" ? "Sec/question" : "Story time (sec)"}</span><input id="itemSeconds" type="number" min="1" max="3600" value="${sec}"/></label></div>
        ${state.mode === "TAT" ? `<div class="inline-settings"><label class="field compact"><span>Observe (sec)</span><input id="observeSeconds" type="number" min="1" max="300" value="${settings.tatObserve}"/></label></div>` : ""}
        ${state.mode === "PPDT" ? `<div class="inline-settings"><label class="field compact"><span>Observe (sec)</span><input id="observeSeconds" type="number" min="1" max="300" value="${settings.ppdtObserve}"/></label><label class="field compact"><span>Narration (sec)</span><input id="narrateSeconds" type="number" min="1" max="600" value="${settings.ppdtNarrate}"/></label></div>` : ""}
        <label class="check-field"><input id="shuffle" type="checkbox" ${settings.shuffle ? "checked" : ""}/><span><b>Shuffle order</b><small>Randomize prompts.</small></span></label>` : `<p style="color:var(--muted);font-size:11px;margin:12px 0">Exam timings are locked to official SSB parameters.</p>`}
        <div class="form-actions">
          <button class="btn ${examMode ? "btn-exam" : "btn-primary"}" data-action="start">▶ ${examMode ? "Start SSB Exam" : "Start Practice"} <span>→</span></button>
          ${!examMode ? `<button class="btn btn-secondary" data-action="import">＋ Import bank</button>` : ""}
        </div>
      </div>
      <div class="setup-aside"><div class="aside-icon">${mi.icon}</div><div class="eyebrow">${examMode ? "REAL EXAM" : "SESSION PROTOCOL"}</div><h3>${esc(mi.short)} <span>${examMode ? "EXAM" : "SIMULATION"}</span></h3><p>${esc(msg)}</p>
        <div class="protocol-list"><div><i>01</i><span>One prompt at a time</span></div><div><i>02</i><span>Write on paper</span></div><div><i>03</i><span>${examMode ? "No pausing" : "Pause anytime"}</span></div><div><i>04</i><span>Review after</span></div></div>
        <div class="source-tag">SOURCE <b>${esc(bank?.source || "No source")}</b></div>
      </div></div>
    </section>
    ${!examMode ? `<section class="below-grid"><div class="mini-card"><div class="mini-head"><span>◷</span><b>TIMING PRESETS</b></div><div class="preset-buttons">${presets(state.mode).map(v => `<button data-action="preset" data-seconds="${v}">${dur(v)}</button>`).join("")}</div><small>Apply to the writing phase.</small></div><div class="mini-card"><div class="mini-head"><span>▤</span><b>PRACTICE SETS</b></div><p>Browse all available question banks and custom imports.</p><button class="text-button" data-action="view" data-view="sets">Browse practice sets →</button></div></section>` : ""}
  </section>`;
}

/* ===== SESSION VIEW ===== */
function sessionView() {
  if (session.completed) return reviewView(session, true);
  const item = session.items[session.index];
  const isBlank = Boolean(item?.isBlank);
  const showImage = imageMode(session.mode) && session.phase === "observe" && !isBlank;
  const hidden = imageMode(session.mode) && !showImage && !isBlank && session.phase !== "rest";
  const phaseName = { item: "WRITE YOUR RESPONSE", observe: "OBSERVE THE PICTURE", story: "STORY WRITING", narrate: "NARRATION PRACTICE", rest: "REST BREAK" }[session.phase] || "PRACTICE";
  const hint = session.mode === "WAT" ? "Write one spontaneous sentence on paper." : session.mode === "SRT" ? "Write a short practical response." : session.mode === "INTERVIEW" ? "Answer aloud or on paper." : isBlank ? (session.phase === "observe" ? "Conceive your setting and characters." : "Write your blank slide story.") : session.phase === "observe" ? "Study the picture carefully." : session.phase === "story" ? "Write your story on paper." : session.phase === "narrate" ? "Narrate your story clearly." : "Prepare for next item.";
  const progress = Math.round(session.index / session.items.length * 100);

  return `<section class="live-shell">
    ${session.examMode ? `<div class="exam-mode-banner"><span class="exam-badge">🔴 EXAM MODE</span><b>Real SSB Timing — No Pausing Allowed</b></div>` : ""}
    <div class="live-toolbar"><div><div class="eyebrow">LIVE · ${esc(session.mode)}${session.examMode ? " · EXAM" : ""}</div><div class="item-index">ITEM <b>${String(session.index + 1).padStart(2, "0")}</b><span>/ ${String(session.items.length).padStart(2, "0")}</span></div></div><div class="live-status ${session.paused ? "paused" : ""}"><span class="online-dot"></span>${session.paused ? "PAUSED" : "ACTIVE"}</div><button class="btn btn-quiet" data-action="finish">Finish</button></div>
    <div class="overall-progress"><div style="width:${progress}%"></div></div>
    <div class="live-timer-card"><div class="phase-line"><span>${esc(phaseName)}</span><span>${session.phase === "item" ? "TIMED" : session.phase === "rest" ? "PREP" : `PHASE ${session.phase === "observe" ? "1" : session.phase === "story" ? "2" : "3"}`}</span></div>
      <div class="countdown-display ${session.remaining <= 5 && !session.paused ? "urgent" : ""}"><div class="clock-label">${session.mode === "WAT" ? "STIMULUS WORD" : session.mode === "SRT" ? "SITUATION" : session.mode === "INTERVIEW" ? "QUESTION" : isBlank ? "BLANK SLIDE (12)" : session.phase === "observe" ? "PICTURE" : "RESPONSE TIME"}</div><div id="clockValue">${fmt(session.remaining)}</div><div class="clock-sub">ITEM ${session.index + 1} OF ${session.items.length} · <span id="elapsedLive">${fmt(elapsed())}</span> ELAPSED</div></div>
      ${isBlank ? `
        <div class="blank-slide-stage ${session.phase === 'story' ? 'active-writing' : ''}">
          <div class="blank-slide-badge">${session.phase === 'observe' ? 'BLANK SLIDE (SLIDE 12)' : 'STORY WRITING PHASE'}</div>
          <div class="blank-slide-title">${session.phase === 'observe' ? 'Imagine Your Own Scene' : 'Write Your Story'}</div>
          <p class="blank-slide-desc">${session.phase === 'observe' ? 'In the official SSB TAT, the 12th slide is kept blank. Imagine a character, setting, and situation of your own choice.' : 'Detail the background, immediate actions taken by the central character, and a positive conclusion.'}</p>
        </div>
      ` : ""}
      ${showImage && item.image ? `<div class="image-stage"><img class="stimulus-image" src="${esc(item.image)}" alt="${esc(item.title)}" data-image-path="${esc(item.image)}"/><div class="image-caption">${esc(item.title)}</div></div>` : ""}
      ${hidden ? `<div class="picture-hidden"><span>▧</span><b>PICTURE HIDDEN</b><small>Available in review.</small></div>` : ""}
      <div class="prompt-zone ${session.mode === "WAT" ? "wat-prompt" : ""}">
        ${session.mode === "INTERVIEW" ? `<div class="priority-chip ${esc(String(item.priority).toLowerCase())}">${esc(item.priority)} · ${esc(item.topic)}</div><div class="prompt-text">${esc(prompt(item, session.mode))}</div><details class="during-answer"><summary>Reveal answer</summary><p>${esc(item.answer)}</p></details>` :
          isBlank ? `<div class="prompt-text small-prompt">Picture 12 (Blank Slide)</div><p class="prompt-instruction">${esc(hint)}</p>` :
          imageMode(session.mode) ? `<div class="prompt-text small-prompt">${esc(hint)}</div>` :
          `<div class="prompt-text">${esc(prompt(item, session.mode))}</div><p class="prompt-instruction">${esc(hint)}</p>`}
      </div>
      <div class="live-controls">
        ${!session.examMode ? (session.paused ? `<button class="btn btn-primary" data-action="resume">▶ Resume</button>` : `<button class="btn btn-primary" data-action="pause">Ⅱ Pause</button>`) : ""}
        ${!session.examMode ? `<button class="btn btn-secondary" data-action="restart">↻ Restart</button>` : ""}
        <button class="btn btn-secondary" data-action="skip">Skip →</button>
        <button class="btn btn-quiet" data-action="mute">${settings.beep ? "🔊" : "🔇"}</button>
      </div>
      <div class="time-track"><div id="timeFill" class="${session.remaining <= 5 ? "urgent" : ""}" style="width:${Math.max(0, session.remaining / session.phaseDuration * 100)}%"></div></div>
    </div>
    <div class="live-foot"><span><i class="online-dot"></i> Paper-based · <kbd>Space</kbd> pause · <kbd>→</kbd> skip</span><span>${session.shownCount} seen · ${session.items.length - session.shownCount} left</span></div>
  </section>`;
}

function imageStage(item) { return item.image ? `<div class="image-stage"><img class="stimulus-image" src="${esc(item.image)}" alt="${esc(item.title)}"/><div class="image-caption">${esc(item.title)}</div></div>` : ""; }

/* ===== Review View ===== */
function reviewView(record, current) {
  const shown = record.items.slice(0, Math.max(Number(record.shownCount || 0), record.endedEarly ? record.index + 1 : record.items.length));
  return `<section class="review-shell"><div class="debrief-hero"><div class="debrief-check">${record.endedEarly ? "!" : "✓"}</div><div><div class="eyebrow">${record.endedEarly ? "ENDED EARLY" : "COMPLETE"}${record.examMode ? " · EXAM MODE" : ""}</div><h2>Session Review</h2><p>Review your stimuli and record reflections.</p></div></div>
    <div class="debrief-stats"><div><span>SEEN</span><b>${record.shownCount || shown.length}</b></div><div><span>SKIPPED</span><b>${record.skippedCount || 0}</b></div><div><span>TIME</span><b>${fmt(record.elapsed || elapsed(record))}</b></div><div><span>MODE</span><b>${esc(record.mode)}${record.examMode ? " EXAM" : ""}</b></div></div>
    <div class="debrief-actions"><button class="btn btn-primary" data-action="export-session" data-id="${esc(record.id)}">↓ Export</button>${current ? `<button class="btn btn-secondary" data-action="new-run">↻ New run</button><button class="btn btn-secondary" data-action="setup">Back</button>` : `<button class="btn btn-secondary" data-action="history">Back to history</button>`}</div>
    <section class="reflection-card"><div><div class="eyebrow">PERSONAL DEBRIEF</div><h3>Reflection</h3></div><div class="field-grid two"><label class="field"><span>Self-rating</span><select id="selfRating"><option value="">Not rated</option>${[1,2,3,4,5].map(v => `<option value="${v}" ${String(record.selfRating) === String(v) ? "selected" : ""}>${v}/5</option>`).join("")}</select></label><label class="field"><span>Focus topics</span><input id="focusTopics" value="${esc(record.focusTopics || "")}" placeholder="e.g. narration, composure"/></label></div><label class="field"><span>Notes</span><textarea id="sessionNote" rows="3" placeholder="What worked?">${esc(record.note || "")}</textarea></label><button class="btn btn-secondary" data-action="save-notes" data-id="${esc(record.id)}">Save</button></section>
    <div class="question-log"><div class="log-heading"><span>STIMULI</span><span>${shown.length} ITEMS</span></div>${shown.map((item, i) => `<div class="log-row"><span class="log-num">${String(i + 1).padStart(2, "0")}</span>${imageMode(record.mode) ? `<img class="log-thumb" loading="lazy" src="${esc(item.thumbnail || item.image)}" alt="${esc(item.title)}"/>` : ""}<div class="log-prompt"><b>${esc(prompt(item, record.mode))}</b><small>${esc(item.source || "")}${item.page ? ` · p${item.page}` : ""}</small>${record.mode === "INTERVIEW" ? `<details><summary>Answer</summary><p>${esc(item.answer || "N/A")}</p></details>` : ""}</div><span class="log-tag">${record.itemStatus?.[item.id] === "skipped" ? "SKIP" : "✓"}</span></div>`).join("")}</div>
  </section>`;
}

/* ===== ANALYTICS VIEW ===== */
function analyticsView() {
  const a = getAnalytics();
  const focus = [...new Set(history.flatMap(x => String(x.focusTopics || "").split(/[,;\n]/)).map(x => x.trim()).filter(Boolean))];
  return `<section class="analytics-page dashboard">
    <div class="section-heading"><div><div class="eyebrow">PERSONAL TRACKING</div><h2>Practice Analytics</h2><p>These track your own practice, not official SSB scores.</p></div></div>
    <div class="dash-stats"><div class="dash-stat"><div class="dash-stat-icon">📊</div><div class="dash-stat-value">${a.sessions.length}</div><div class="dash-stat-label">TOTAL SESSIONS</div></div>
      <div class="dash-stat"><div class="dash-stat-icon">⏱️</div><div class="dash-stat-value">${fmt(a.totalTime)}</div><div class="dash-stat-label">TOTAL TIME</div></div>
      <div class="dash-stat"><div class="dash-stat-icon">🔥</div><div class="dash-stat-value">${a.streak}</div><div class="dash-stat-label">STREAK (DAYS)</div></div>
      <div class="dash-stat"><div class="dash-stat-icon">⭐</div><div class="dash-stat-value">${a.avgRating || "—"}</div><div class="dash-stat-label">AVG SELF-RATING</div></div>
    </div>
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="chart-container"><div class="chart-title">SESSIONS BY MODE</div><div class="bar-chart">${MODES.map(m => { const v = a.byMode[m.id]?.length || 0; const mx = Math.max(1, ...MODES.map(x => a.byMode[x.id]?.length || 0)); return `<div class="bar-col"><div class="bar-value">${v}</div><div class="bar ${m.id.toLowerCase()}" style="height:${Math.max(4, v / mx * 100)}%"></div><div class="bar-label">${m.short}</div></div>`; }).join("")}</div></div>
      <div class="chart-container"><div class="chart-title">THIS WEEK</div><div class="bar-chart">${MODES.map(m => { const v = a.weekData[m.id] || 0; const mx = Math.max(1, ...Object.values(a.weekData)); return `<div class="bar-col"><div class="bar-value">${v}</div><div class="bar ${m.id.toLowerCase()}" style="height:${Math.max(4, v / mx * 100)}%"></div><div class="bar-label">${m.short}</div></div>`; }).join("")}</div></div>
      <div class="chart-container"><div class="chart-title">ACTIVITY HEATMAP</div><div class="heatmap">${a.heatmap.map(h => `<div class="heat-cell heat-${h.level}" title="${h.date}: ${h.count}"></div>`).join("")}</div><div class="heatmap-legend"><span>Less</span>${[0,1,2,3,4,5].map(l => `<div class="heat-swatch heat-${l}"></div>`).join("")}<span>More</span></div></div>
    </div>
    <section class="library-grid"><div class="library-panel"><div class="library-title">SESSIONS BY MODE</div>${MODES.map(m => `<div class="bank-row"><div><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></div><span>${a.byMode[m.id]?.length || 0} sessions</span></div>`).join("")}</div>
      <div class="library-panel"><div class="library-title">FOCUS TOPICS</div>${focus.length ? `<div class="topic-cloud">${focus.slice(0, 16).map(t => `<span>${esc(t)}</span>`).join("")}</div>` : `<div class="empty-state">Add topics during review.</div>`}</div>
    </section>
  </section>`;
}

/* ===== HISTORY VIEW ===== */
function historyView() {
  if (reviewId) { const r = history.find(x => x.id === reviewId); if (r) return reviewView(r, false); reviewId = null; }
  if (!history.length) return `<section class="empty-history"><div class="empty-icon">▥</div><h2>No sessions yet</h2><p>Completed runs appear here.</p><button class="btn btn-primary" data-action="view" data-view="practice">Start practising →</button></section>`;
  return `<section class="history-page dashboard"><div class="section-heading"><div><div class="eyebrow">COMPLETED SESSIONS</div><h2>Session History</h2><p>Saved locally in this browser.</p></div><button class="btn btn-secondary" data-action="clear-history">Clear</button></div>
    ${history.map(r => `<div class="history-row"><div class="history-icon">${esc(r.mode)}</div><div class="history-main"><b>${esc(r.bankTitle || `${r.mode} session`)}${r.examMode ? " 🔴" : ""}</b><small>${new Date(r.endedAt || r.startedAt).toLocaleString()} · ${r.shownCount || r.items?.length || 0} prompts</small></div><div class="history-time"><b>${fmt(r.elapsed || 0)}</b><small>time</small></div><button class="btn btn-quiet" data-action="review" data-id="${esc(r.id)}">Review</button><button class="btn btn-quiet" data-action="export-session" data-id="${esc(r.id)}">Export</button></div>`).join("")}
  </section>`;
}

/* ===== SETTINGS PAGE VIEW ===== */
function settingsPageView() {
  const s = settings;
  return `<section class="settings-page dashboard">
    <div class="section-heading"><div><div class="eyebrow">CUSTOMIZATION</div><h2>Settings</h2><p>Personalize your ZeroHour experience.</p></div><button class="btn btn-primary" data-action="save-page-settings">Save All Settings</button></div>

    <div class="settings-section-title">Appearance</div>
    <div class="settings-group"><h3><span>🎨</span> Theme</h3>
      <div class="theme-grid">
        ${[
          { id: "midnight", name: "Midnight", bg: "#060a12" },
          { id: "military", name: "Military", bg: "#0a1208" },
          { id: "ocean", name: "Ocean", bg: "#060812" },
          { id: "ember", name: "Ember", bg: "#120806" },
          { id: "stealth", name: "Stealth", bg: "#0a0a0a" },
          { id: "aurora", name: "Aurora", bg: "#080612" }
        ].map(t => `<div class="theme-option ${s.theme === t.id ? "active" : ""}" data-action="set-theme" data-theme="${t.id}"><div class="theme-swatch" style="background:${t.bg}"></div><div class="theme-name">${t.name}</div></div>`).join("")}
      </div>
    </div>

    <div class="settings-group"><h3><span>📐</span> Display</h3>
      <div class="setting-row"><div class="setting-label"><b>Font Size</b><small>Adjust text size across the app</small></div><select id="s-fontSize" class="field"><option ${s.fontSize === "small" ? "selected" : ""} value="small">Small</option><option ${s.fontSize === "medium" ? "selected" : ""} value="medium">Medium</option><option ${s.fontSize === "large" ? "selected" : ""} value="large">Large</option></select></div>
      <div class="setting-row"><div class="setting-label"><b>Particle Effects</b><small>Animated background particles</small></div><label class="toggle-switch"><input type="checkbox" id="s-showParticles" ${s.showParticles ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
      <div class="setting-row"><div class="setting-label"><b>Motivational Quotes</b><small>Show daily quotes on dashboard</small></div><label class="toggle-switch"><input type="checkbox" id="s-showMotivation" ${s.showMotivation ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
      <div class="setting-row"><div class="setting-label"><b>Show Streak Badge</b><small>Display streak on dashboard</small></div><label class="toggle-switch"><input type="checkbox" id="s-showStreak" ${s.showStreak ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
    </div>

    <div class="settings-section-title">Practice Defaults</div>
    <div class="settings-group"><h3><span>⏱️</span> WAT — Word Association Test</h3>
      <div class="field-grid two"><label class="field"><span>Seconds per word</span><input id="s-watSeconds" type="number" min="1" max="120" value="${s.watSeconds}"/></label><label class="field"><span>Words per run</span><input id="s-watCount" type="number" min="1" max="1000" value="${s.watCount}"/></label></div>
    </div>
    <div class="settings-group"><h3><span>▧</span> TAT — Thematic Apperception</h3>
      <div class="field-grid three"><label class="field"><span>Observe (sec)</span><input id="s-tatObserve" type="number" min="1" max="300" value="${s.tatObserve}"/></label><label class="field"><span>Story (sec)</span><input id="s-tatStory" type="number" min="1" max="3600" value="${s.tatStory}"/></label><label class="field"><span>Stories/run</span><input id="s-tatCount" type="number" min="1" max="500" value="${s.tatCount}"/></label></div>
    </div>
    <div class="settings-group"><h3><span>▣</span> PPDT — Picture Perception</h3>
      <div class="field-grid four"><label class="field"><span>Observe</span><input id="s-ppdtObserve" type="number" min="1" max="300" value="${s.ppdtObserve}"/></label><label class="field"><span>Story</span><input id="s-ppdtStory" type="number" min="1" max="3600" value="${s.ppdtStory}"/></label><label class="field"><span>Narrate</span><input id="s-ppdtNarrate" type="number" min="1" max="600" value="${s.ppdtNarrate}"/></label><label class="field"><span>Pictures</span><input id="s-ppdtCount" type="number" min="1" max="500" value="${s.ppdtCount}"/></label></div>
    </div>
    <div class="settings-group"><h3><span>☷</span> SRT — Situation Reaction</h3>
      <div class="field-grid two"><label class="field"><span>Seconds per SRT</span><input id="s-srtSeconds" type="number" min="1" max="120" value="${s.srtSeconds}"/></label><label class="field"><span>SRT per run</span><input id="s-srtCount" type="number" min="1" max="1000" value="${s.srtCount}"/></label></div>
    </div>

    <div class="settings-section-title">Behavior</div>
    <div class="settings-group"><h3><span>🔧</span> Session Options</h3>
      <div class="setting-row"><div class="setting-label"><b>Shuffle Questions</b><small>Randomize order each run</small></div><label class="toggle-switch"><input type="checkbox" id="s-shuffle" ${s.shuffle ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
      <div class="setting-row"><div class="setting-label"><b>Remove Duplicates</b><small>Suppress exact duplicates</small></div><label class="toggle-switch"><input type="checkbox" id="s-dedupe" ${s.dedupe ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
      <div class="setting-row"><div class="setting-label"><b>Sound Alerts</b><small>Play beep on phase end</small></div><label class="toggle-switch"><input type="checkbox" id="s-beep" ${s.beep ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
      <div class="setting-row"><div class="setting-label"><b>Rest Breaks</b><small>Short pause between items</small></div><label class="toggle-switch"><input type="checkbox" id="s-restEnabled" ${s.restEnabled ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
      <div class="setting-row"><div class="setting-label"><b>Keyboard Shortcuts</b><small>Space=pause, →=skip, R=restart</small></div><label class="toggle-switch"><input type="checkbox" id="s-keyboardShortcuts" ${s.keyboardShortcuts ? "checked" : ""}/><span class="toggle-slider"></span></label></div>
      <div class="field-grid two" style="margin-top:12px"><label class="field"><span>Rest length (sec)</span><input id="s-restSeconds" type="number" min="1" max="120" value="${s.restSeconds}"/></label><label class="field"><span>Daily goal (sessions)</span><input id="s-dailyGoal" type="number" min="1" max="20" value="${s.dailyGoal}"/></label></div>
    </div>

    <div class="settings-section-title">Data Management</div>
    <div class="settings-group"><h3><span>💾</span> Backup & Restore</h3>
      <div class="form-actions"><button class="btn btn-secondary" data-action="export-backup">↓ Download Backup</button><button class="btn btn-secondary" data-action="backup">↑ Restore Backup</button><button class="btn btn-danger" data-action="clear-history">🗑️ Clear History</button></div>
    </div>
  </section>`;
}

/* ===== LIBRARY VIEW ===== */
function libraryView() {
  const originals = MODES.flatMap(m => optionsFor(m.id).filter(x => x.original));
  const custom = MODES.flatMap(m => (customBanks[m.id] || []).map(b => ({ ...b, mode: m.id })));
  return `<section class="materials-page dashboard"><div class="section-heading"><div><div class="eyebrow">MATERIAL LIBRARY</div><h2>Source Banks & Imports</h2></div><button class="btn btn-secondary" data-action="import">＋ Import</button></div>
    <section class="library-grid"><div class="library-panel"><div class="library-title">BUILT-IN BANKS</div>${originals.map(x => `<div class="bank-row"><div><b>${esc(x.title)}</b><small>${esc(x.source)}</small></div><span>${x.count} items</span></div>`).join("")}</div>
      <div class="library-panel"><div class="library-title">CUSTOM BANKS</div>${custom.length ? custom.map(b => `<div class="bank-row custom-bank-row"><div><b>${esc(b.title)}</b><small>${esc(b.mode)} · ${esc(b.source || "Custom")}</small></div><div class="bank-actions"><button class="text-button" data-action="export-bank" data-mode="${b.mode}" data-bank="${esc(b.id)}">Export</button><button class="text-button danger-text" data-action="delete-bank" data-mode="${b.mode}" data-bank="${esc(b.id)}">Delete</button></div></div>`).join("") : `<div class="empty-state">No custom banks yet.</div>`}</div>
    </section></section>`;
}

/* ===== MODALS ===== */
function modalView() { if (modal.type === "settings") return settingsModal(); if (modal.type === "import") return importModal(); if (modal.type === "backup") return backupModal(); if (modal.type === "restore") return restoreModal(); return recoveryModal(); }
function wrap(c) { return `<div class="modal-backdrop" data-action="close-modal"><div class="settings-modal" role="dialog" aria-modal="true">${c}</div></div>`; }
function close() { return `<button class="close-button" data-action="close-modal">×</button>`; }
function num(id, label, val, min = 1, max = 3600) { return `<label class="field compact"><span>${esc(label)}</span><input id="${id}" type="number" min="${min}" max="${max}" value="${val}"/></label>`; }

function settingsModal() {
  const s = settings;
  return wrap(`<div class="modal-title"><div><div class="eyebrow">TIMINGS</div><h2>Quick Settings</h2></div>${close()}</div>
    <div class="settings-section"><h3>WAT</h3><div class="field-grid two">${num("watSeconds", "Sec/word", s.watSeconds, 1, 120)}${num("watCount", "Words", s.watCount)}</div></div>
    <div class="settings-section"><h3>TAT</h3><div class="field-grid three">${num("tatObserve", "Observe", s.tatObserve, 1, 300)}${num("tatStory", "Story", s.tatStory)}${num("tatCount", "Count", s.tatCount, 1, 500)}</div></div>
    <div class="settings-section"><h3>PPDT</h3><div class="field-grid four">${num("ppdtObserve", "Observe", s.ppdtObserve, 1, 300)}${num("ppdtStory", "Story", s.ppdtStory)}${num("ppdtNarrate", "Narrate", s.ppdtNarrate, 1, 600)}${num("ppdtCount", "Count", s.ppdtCount, 1, 500)}</div></div>
    <div class="settings-section"><h3>SRT & Interview</h3><div class="field-grid four">${num("srtSeconds", "SRT sec", s.srtSeconds, 1, 120)}${num("srtCount", "SRT count", s.srtCount)}${num("interviewSeconds", "Int sec", s.interviewSeconds)}${num("interviewCount", "Int count", s.interviewCount)}</div></div>
    <div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-settings">Save</button></div>`);
}
function importModal() {
  return wrap(`<div class="modal-title"><div><div class="eyebrow">CUSTOM BANK</div><h2>Import Prompts</h2></div>${close()}</div>
    <p>Paste one prompt per line or import TXT/CSV/JSON.</p>
    <label class="field"><span>Bank name</span><input id="customBankName" placeholder="e.g. WAT Difficult Set"/></label>
    <label class="field"><span>Source</span><input id="customBankSource" placeholder="e.g. My notes"/></label>
    <label class="field"><span>File</span><input id="importFile" type="file" accept=".txt,.csv,.json"/></label>
    <label class="field"><span>Prompts</span><textarea id="customPromptText" rows="8" placeholder="One per line"></textarea></label>
    <div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-import">Save Bank</button></div>`);
}
function backupModal() {
  return wrap(`<div class="modal-title"><div><div class="eyebrow">DATA SAFETY</div><h2>Backup & Restore</h2></div>${close()}</div>
    <p>Versioned JSON with settings, banks, and history.</p>
    <div class="backup-grid"><div><h3>Export</h3><p>Download your data.</p><button class="btn btn-primary" data-action="export-backup">↓ Download</button></div><div><h3>Restore</h3><p>Upload a backup file.</p><label class="btn btn-secondary file-button">↑ Choose file<input id="backupFile" type="file" accept=".json"/></label></div></div>
    <div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">Close</button></div>`);
}
function restoreModal() { const d = modal.backup.data; return wrap(`<div class="modal-title"><div><div class="eyebrow">RESTORE</div><h2>Choose action</h2></div>${close()}</div><p>Contains ${Object.values(d.customBanks || {}).flat().length} banks, ${(d.history || []).length} sessions.</p><div class="restore-options"><button class="btn btn-primary" data-action="restore-merge">Merge</button><button class="btn btn-danger" data-action="restore-replace">Replace all</button></div><div class="modal-actions"><button class="btn btn-secondary" data-action="backup">Back</button></div>`); }
function recoveryModal() { const d = pendingRecovery; return wrap(`<div class="modal-title"><div><div class="eyebrow">INTERRUPTED</div><h2>Resume session?</h2></div></div><p>A ${esc(d.mode)} session was interrupted at ${fmt(d.remaining)}.</p><div class="modal-actions"><button class="btn btn-secondary" data-action="discard-recovery">Discard</button><button class="btn btn-primary" data-action="resume-recovery">Resume</button></div>`); }

/* ===== Session Logic ===== */
function start() {
  const m = state.mode, bankId = selectedBank(m), orig = itemsFor(m, bankId), clean = settings.dedupe ? unique(orig, m) : { kept: orig, duplicates: 0 };
  let items = clean.kept;
  if (settings.shuffle && !examMode) {
    if (bankId.startsWith("tat-set-") && items.length === 12) {
      const imgs = items.slice(0, 11);
      const blank = items[11];
      items = [...shuffle(imgs), blank];
    } else {
      items = shuffle(items);
    }
  }
  let count;
  if (examMode && EXAM_TIMINGS[m]) {
    count = EXAM_TIMINGS[m].count || items.length;
  } else {
    count = m === "WAT" ? settings.watCount : m === "SRT" ? settings.srtCount : m === "TAT" ? settings.tatCount : m === "PPDT" ? settings.ppdtCount : settings.interviewCount;
  }
  items = items.slice(0, Math.max(1, Math.min(Number(count) || 1, items.length)));
  if (!items.length) { notice("No prompts available. Choose another bank."); return; }
  const bank = optionsFor(m).find(x => x.id === bankId);
  session = { id: uid("session"), mode: m, bankId, bankTitle: bank?.title || "Selected bank", source: bank?.source || "Unknown", items, index: 0, phase: firstPhase(m), phaseDuration: 0, remaining: 0, paused: false, completed: false, startedAt: new Date().toISOString(), elapsedBefore: 0, activeStartedAt: Date.now(), shownCount: 0, skippedCount: 0, suppressedDuplicates: clean.duplicates, itemStatus: {}, note: "", selfRating: "", focusTopics: "", examMode };
  currentView = "practice"; startPhase(session.phase); say(`${modeInfo().name} started.`);
}

function elapsed(r = session) { if (!r) return 0; return Math.max(0, Number(r.elapsedBefore || r.elapsed || 0) + (r.activeStartedAt ? Math.floor((Date.now() - r.activeStartedAt) / 1000) : 0)); }
function settle() { if (session?.activeStartedAt) { session.elapsedBefore = elapsed(); session.activeStartedAt = null; } }
function startPhase(phase, newClock = true) { if (!session || session.completed) return; clearTimer(); session.phase = phase; session.phaseDuration = phaseSeconds(session.mode, phase); if (newClock) session.remaining = session.phaseDuration; session.paused = false; if (!session.activeStartedAt) session.activeStartedAt = Date.now(); endsAt = Date.now() + session.remaining * 1000; session.shownCount = Math.max(session.shownCount, phase === "rest" ? session.index : session.index + 1); saveActive("active"); timer = setInterval(tick, 125); render(); }
function clearTimer() { if (timer) clearInterval(timer); timer = null; endsAt = null; }
function remaining() { return endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : Math.max(0, Number(session?.remaining) || 0); }
function tick() { if (!session || session.completed || session.paused) return; session.remaining = remaining(); const clock = $("#clockValue"), fill = $("#timeFill"), el = $("#elapsedLive"); if (clock) clock.textContent = fmt(session.remaining); if (fill) { fill.style.width = `${Math.max(0, Math.min(100, session.remaining / session.phaseDuration * 100))}%`; fill.classList.toggle("urgent", session.remaining <= 5); } if (el) el.textContent = fmt(elapsed()); if (session.remaining <= 0) { clearTimer(); if (settings.beep) beep(); advance(); } }
function beep() { try { audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)(); const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.connect(gain); gain.connect(audioContext.destination); osc.frequency.value = 880; const vol = (settings.soundVolume || 80) / 100 * 0.12; gain.gain.setValueAtTime(vol, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .2); osc.start(); osc.stop(audioContext.currentTime + .22); } catch {} }
function advance() { if (!session) return; if (session.phase === "rest") return next(); if (imageMode(session.mode) && session.phase === "observe") return startPhase("story"); if (session.mode === "PPDT" && session.phase === "story") return startPhase("narrate"); if (settings.restEnabled && session.index < session.items.length - 1) return startPhase("rest"); next(); }
function next() { if (!session) return; if (session.index + 1 >= session.items.length) return complete(false); session.index++; startPhase(firstPhase(session.mode)); }
function pause(reason = "paused") { if (!session || session.completed || session.paused || session.examMode) return; session.remaining = remaining(); settle(); clearTimer(); session.paused = true; saveActive(reason); render(); say("Paused."); }
function resume() { if (!session || session.completed || !session.paused) return; session.paused = false; session.activeStartedAt = Date.now(); endsAt = Date.now() + Math.max(1, session.remaining) * 1000; timer = setInterval(tick, 125); saveActive("active"); render(); say("Resumed."); }
function restart() { if (!session || session.completed || session.examMode) return; settle(); session.remaining = phaseSeconds(session.mode, session.phase); startPhase(session.phase); }
function skip() { if (!session || session.completed) return; session.itemStatus[session.items[session.index].id] = "skipped"; session.skippedCount++; settle(); if (settings.restEnabled && session.index < session.items.length - 1) startPhase("rest"); else next(); }
function complete(early) { if (!session || session.completed) return; settle(); clearTimer(); session.completed = true; session.endedAt = new Date().toISOString(); session.elapsed = elapsed(); session.endedEarly = Boolean(early); history = [structuredClone(session), ...history.filter(x => x.id !== session.id)].slice(0, 100); clearActive(); persist(); render(); say(early ? "Saved early." : "Complete."); }
function discard() { clearTimer(); session = null; pendingRecovery = null; clearActive(); render(); }

function capture() {
  const sel = $("#bankSelect"); if (sel) state.bankIds[state.mode] = sel.value;
  const val = (id, fb, min = 1, max = 5000) => { const n = Number($("#" + id)?.value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fb; };
  if (!examMode) {
    if (state.mode === "WAT") { settings.watCount = val("itemCount", settings.watCount); settings.watSeconds = val("itemSeconds", settings.watSeconds, 1, 120); }
    if (state.mode === "SRT") { settings.srtCount = val("itemCount", settings.srtCount); settings.srtSeconds = val("itemSeconds", settings.srtSeconds, 1, 120); }
    if (state.mode === "INTERVIEW") { settings.interviewCount = val("itemCount", settings.interviewCount); settings.interviewSeconds = val("itemSeconds", settings.interviewSeconds); settings.interviewPriority = $("#interviewPriority")?.value || settings.interviewPriority; settings.interviewTopic = $("#interviewTopic")?.value || settings.interviewTopic; }
    if (state.mode === "TAT") { settings.tatCount = val("itemCount", settings.tatCount, 1, 500); settings.tatStory = val("itemSeconds", settings.tatStory); settings.tatObserve = val("observeSeconds", settings.tatObserve, 1, 300); }
    if (state.mode === "PPDT") { settings.ppdtCount = val("itemCount", settings.ppdtCount, 1, 500); settings.ppdtStory = val("itemSeconds", settings.ppdtStory); settings.ppdtObserve = val("observeSeconds", settings.ppdtObserve, 1, 300); settings.ppdtNarrate = val("narrateSeconds", settings.ppdtNarrate, 1, 600); }
    settings.shuffle = Boolean($("#shuffle")?.checked);
  }
  persist();
}

/* ===== Import/Export ===== */
function download(v, fn) { const b = new Blob([JSON.stringify(v, null, 2)], { type: "application/json" }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = fn; a.click(); setTimeout(() => URL.revokeObjectURL(u), 0); }
function backup() { return { backupVersion: 1, app: "ZeroHour SSB v3", createdAt: new Date().toISOString(), data: { state, settings, customBanks, history } }; }
function validateBackup(v) { if (!v || typeof v !== "object") return "Invalid."; if (!v.data) return "No data."; return ""; }
function restore(replace) { const c = modal?.backup, err = validateBackup(c); if (err) return notice(err); const d = c.data; if (replace) { if (!confirm("Replace all data?")) return; state = { version: 3, mode: "WAT", bankIds: {}, ...(d.state || {}), bankIds: { ...(d.state?.bankIds || {}) } }; settings = { ...DEFAULT_SETTINGS, ...(d.settings || d.state?.settings || {}) }; customBanks = d.customBanks || {}; history = d.history || []; } else { settings = { ...settings, ...(d.settings || d.state?.settings || {}) }; for (const [m, bs] of Object.entries(d.customBanks || {})) { const ex = customBanks[m] || [], ids = new Set(ex.map(x => x.id)); customBanks[m] = [...ex, ...(Array.isArray(bs) ? bs.filter(x => !ids.has(x.id)) : [])]; } const ids = new Set(history.map(x => x.id)); history = [...history, ...(d.history || []).filter(x => !ids.has(x.id))].slice(0, 100); } modal = null; persist(); notice(replace ? "Replaced." : "Merged."); }
function parseText(text, fn, m) { if (fn.toLowerCase().endsWith(".json")) { try { const r = JSON.parse(text), v = Array.isArray(r) ? r : r.items || r.questions || r.prompts || []; return { items: v.map((x, i) => normalise(x, m, { id: "import", source: r.source || "Import" }, i)).filter(x => prompt(x, m)), rejected: 0 }; } catch { return { items: [], rejected: 1, error: "Invalid JSON." }; } } const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean); const vals = lines.map(x => fn.endsWith(".csv") ? x.split(",")[0].replace(/^['"]|['"]$/g, "").trim() : x.replace(/^\s*(?:\d{1,4}\s*[.)]|[-•*])\s*/, "").trim()).filter(Boolean); return { items: vals.map((x, i) => normalise(x, m, { id: "import", source: "Text import" }, i)), rejected: lines.length - vals.length }; }
function saveImport() { const parsed = parseText($("#customPromptText")?.value || "", ".txt", state.mode); if (!parsed.items.length) return notice("Enter prompts."); const result = unique(parsed.items, state.mode), id = uid("custom"), bank = { id, title: ($("#customBankName")?.value || "Custom bank").trim(), source: ($("#customBankSource")?.value || "Custom").trim(), createdAt: new Date().toISOString(), items: result.kept, stats: { valid: result.kept.length, duplicates: result.duplicates } }; customBanks[state.mode] = [...(customBanks[state.mode] || []), bank]; state.bankIds[state.mode] = id; modal = null; persist(); notice(`${bank.stats.valid} prompts saved.`); }
function exportSession(r) { if (!r) return; download({ type: "zerohour-session", id: r.id, mode: r.mode, bank: { id: r.bankId, title: r.bankTitle, source: r.source }, startedAt: r.startedAt, endedAt: r.endedAt, elapsed: r.elapsed || elapsed(r), examMode: r.examMode, items: r.items.map((x, i) => ({ order: i + 1, prompt: prompt(x, r.mode), source: x.source, status: r.itemStatus?.[x.id] || "shown" })) }, `zerohour-${r.mode.toLowerCase()}-${r.id}.json`); }

/* ===== Save Settings Page ===== */
function savePageSettings() {
  const val = (id, fb, min = 1, max = 5000) => { const n = Number($("#" + id)?.value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fb; };
  settings.watSeconds = val("s-watSeconds", settings.watSeconds, 1, 120);
  settings.watCount = val("s-watCount", settings.watCount);
  settings.tatObserve = val("s-tatObserve", settings.tatObserve, 1, 300);
  settings.tatStory = val("s-tatStory", settings.tatStory);
  settings.tatCount = val("s-tatCount", settings.tatCount, 1, 500);
  settings.ppdtObserve = val("s-ppdtObserve", settings.ppdtObserve, 1, 300);
  settings.ppdtStory = val("s-ppdtStory", settings.ppdtStory);
  settings.ppdtNarrate = val("s-ppdtNarrate", settings.ppdtNarrate, 1, 600);
  settings.ppdtCount = val("s-ppdtCount", settings.ppdtCount, 1, 500);
  settings.srtSeconds = val("s-srtSeconds", settings.srtSeconds, 1, 120);
  settings.srtCount = val("s-srtCount", settings.srtCount);
  settings.restSeconds = val("s-restSeconds", settings.restSeconds, 1, 120);
  settings.dailyGoal = val("s-dailyGoal", settings.dailyGoal, 1, 20);
  settings.fontSize = $("#s-fontSize")?.value || settings.fontSize;
  settings.showParticles = Boolean($("#s-showParticles")?.checked);
  settings.showMotivation = Boolean($("#s-showMotivation")?.checked);
  settings.showStreak = Boolean($("#s-showStreak")?.checked);
  settings.shuffle = Boolean($("#s-shuffle")?.checked);
  settings.dedupe = Boolean($("#s-dedupe")?.checked);
  settings.beep = Boolean($("#s-beep")?.checked);
  settings.restEnabled = Boolean($("#s-restEnabled")?.checked);
  settings.keyboardShortcuts = Boolean($("#s-keyboardShortcuts")?.checked);
  applyTheme();
  applyFontSize();
  persist(); initParticles(); render(); notice("Settings saved!");
}

/* ===== Action Handler ===== */
function action(name, el, ev) {
  if (name === "mode") { if (session && !session.completed && !confirm("Leave session?")) return; if (session && !session.completed) discard(); state.mode = el.dataset.mode; currentView = "practice"; persist(); render(); }
  if (name === "view") { if (session && !session.completed && el.dataset.view !== "practice" && !confirm("Leave session?")) return; if (session && !session.completed && el.dataset.view !== "practice") discard(); currentView = el.dataset.view; reviewId = null; render(); }
  if (name === "settings") { modal = { type: "settings" }; render(); }
  if (name === "backup") { modal = { type: "backup" }; render(); }
  if (name === "import") { modal = { type: "import" }; render(); }
  if (name === "close-modal") { if (el.classList.contains("modal-backdrop") && ev.target !== el) return; modal = null; render(); }
  if (name === "save-settings") {
    const s = settings, val = (id, fb, min = 1, max = 5000) => { const n = Number($("#" + id)?.value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fb; };
    Object.assign(s, { watSeconds: val("watSeconds", s.watSeconds, 1, 120), watCount: val("watCount", s.watCount), tatObserve: val("tatObserve", s.tatObserve, 1, 300), tatStory: val("tatStory", s.tatStory), tatCount: val("tatCount", s.tatCount, 1, 500), ppdtObserve: val("ppdtObserve", s.ppdtObserve, 1, 300), ppdtStory: val("ppdtStory", s.ppdtStory), ppdtNarrate: val("ppdtNarrate", s.ppdtNarrate, 1, 600), ppdtCount: val("ppdtCount", s.ppdtCount, 1, 500), srtSeconds: val("srtSeconds", s.srtSeconds, 1, 120), srtCount: val("srtCount", s.srtCount), interviewSeconds: val("interviewSeconds", s.interviewSeconds), interviewCount: val("interviewCount", s.interviewCount), restSeconds: val("restSeconds", s.restSeconds, 1, 120) });
    modal = null; persist(); notice("Settings saved.");
  }
  if (name === "start") { capture(); start(); }
  if (name === "set-filter") { activeSetFilter = el.dataset.filter; render(); }
  if (name === "start-set") { state.mode = el.dataset.mode; state.bankIds[state.mode] = el.dataset.bank; currentView = "practice"; persist(); render(); }
  if (name === "start-exam-set") { state.mode = el.dataset.mode; state.bankIds[state.mode] = el.dataset.bank; examMode = true; currentView = "practice"; persist(); start(); }
  if (name === "quick-start") { state.mode = el.dataset.mode; currentView = "practice"; persist(); start(); }
  if (name === "toggle-exam") { examMode = !examMode; render(); }
  if (name === "set-theme") { settings.theme = el.dataset.theme; applyTheme(); persist(); render(); notice(`Theme: ${el.dataset.theme}`); }
  if (name === "save-page-settings") savePageSettings();
  if (name === "pause") pause(); if (name === "resume") resume(); if (name === "restart") restart(); if (name === "skip") skip();
  if (name === "finish" && confirm("Finish and save?")) complete(true);
  if (name === "mute") { settings.beep = !settings.beep; persist(); render(); }
  if (name === "new-run") { session = null; start(); } if (name === "setup") { session = null; render(); }
  if (name === "preset") { const v = Number(el.dataset.seconds); if (state.mode === "WAT") settings.watSeconds = v; else if (state.mode === "SRT") settings.srtSeconds = v; else if (state.mode === "INTERVIEW") settings.interviewSeconds = v; else if (state.mode === "TAT") settings.tatStory = v; else settings.ppdtStory = v; persist(); render(); }
  if (name === "save-import") saveImport();
  if (name === "export-backup") { download(backup(), `zerohour-backup-${new Date().toISOString().slice(0, 10)}.json`); notice("Backup downloaded."); }
  if (name === "restore-merge") restore(false); if (name === "restore-replace") restore(true);
  if (name === "resume-recovery") { session = pendingRecovery; pendingRecovery = null; modal = null; session.paused = true; session.activeStartedAt = null; session.completed = false; clearActive(); render(); }
  if (name === "discard-recovery") { pendingRecovery = null; clearActive(); modal = null; notice("Discarded."); }
  if (name === "delete-bank") { const b = findCustom(el.dataset.mode, el.dataset.bank); if (!b || !confirm(`Delete "${b.title}"?`)) return; customBanks[el.dataset.mode] = (customBanks[el.dataset.mode] || []).filter(x => x.id !== b.id); if (state.bankIds[el.dataset.mode] === b.id) delete state.bankIds[el.dataset.mode]; persist(); notice("Deleted."); }
  if (name === "export-bank") { const b = findCustom(el.dataset.mode, el.dataset.bank); if (b) download({ type: "zerohour-bank", mode: el.dataset.mode, ...b }, `zerohour-bank-${b.id}.json`); }
  if (name === "export-session") exportSession(history.find(x => x.id === el.dataset.id) || (session?.id === el.dataset.id ? session : session));
  if (name === "review") { reviewId = el.dataset.id; currentView = "history"; render(); } if (name === "history") { reviewId = null; currentView = "history"; render(); }
  if (name === "clear-history" && confirm("Clear all history?")) { history = []; persist(); render(); }
  if (name === "save-notes") { const r = history.find(x => x.id === el.dataset.id) || (session?.id === el.dataset.id ? session : null); if (!r) return; r.note = $("#sessionNote")?.value || ""; r.selfRating = $("#selfRating")?.value || ""; r.focusTopics = $("#focusTopics")?.value || ""; persist(); notice("Saved."); }
  if (name === "fullscreen") { if (document.fullscreenEnabled) (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); }
}

/* ===== Event Listeners ===== */
app.addEventListener("click", ev => { const el = ev.target.closest("[data-action]"); if (el) action(el.dataset.action, el, ev); });
app.addEventListener("change", ev => {
  if (ev.target.id === "importFile") { const f = ev.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const p = parseText(String(r.result || ""), f.name, state.mode), a = $("#customPromptText"), t = $("#customBankName"); if (a) a.value = p.items.map(x => prompt(x, state.mode)).join("\n"); if (t && !t.value) t.value = f.name.replace(/\.[^.]+$/, ""); }; r.readAsText(f); }
  if (ev.target.id === "backupFile") { const f = ev.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { let v; try { v = JSON.parse(String(r.result || "")); } catch { return notice("Invalid JSON."); } const err = validateBackup(v); if (err) return notice(err); modal = { type: "restore", backup: v }; render(); }; r.readAsText(f); }
});
app.addEventListener("error", ev => { const img = ev.target; if (img instanceof HTMLImageElement && img.classList.contains("stimulus-image")) { const st = img.closest(".image-stage"); if (st) st.innerHTML = `<div class="image-fallback"><b>Image unavailable</b><small>${esc(img.dataset.imagePath || "")}</small></div>`; } }, true);
document.addEventListener("fullscreenchange", render);
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && modal) { modal = null; render(); return; }
  if (!settings.keyboardShortcuts) return;
  const typing = ev.target?.matches?.("input,textarea,select,[contenteditable]");
  if (typing || !session || session.completed) return;
  if (ev.code === "Space") { ev.preventDefault(); session.paused ? resume() : pause(); }
  else if (ev.key === "ArrowRight") { ev.preventDefault(); skip(); }
  else if (ev.key === "r" || ev.key === "R") { ev.preventDefault(); restart(); }
});
document.addEventListener("visibilitychange", () => { if (document.hidden && session && !session.completed && !session.paused && !session.examMode) pause("hidden"); });
window.addEventListener("beforeunload", () => saveActive("closed"));

/* ===== Init ===== */
setupSaved();
initParticles();

fetch("data/banks.json")
  .then(r => { if (!r.ok) throw new Error(`Load failed (${r.status})`); return r.json(); })
  .then(data => {
    banks = data;
    render();
    if (pendingRecovery && !pendingRecovery.completed) { modal = { type: "recovery" }; render(); }
    return fetch("materials/reports/materials-manifest.json").catch(() => null);
  })
  .then(r => r && r.ok ? r.json() : null)
  .then(manifest => { materialManifest = manifest; })
  .catch(err => {
    if (!banks) app.innerHTML = `<div class="load-error"><h1>ZeroHour — Loading Failed</h1><p>Run this folder via a local server:</p><code>python -m http.server 8000</code><p>Then open <b>http://localhost:8000</b></p><small>${esc(err.message)}</small></div>`;
  });
