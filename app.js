const app = document.getElementById("app");
const DEFAULTS = {
  mode: "WAT",
  settings: {
    watSeconds: 10, watCount: 60,
    tatObserve: 30, tatStory: 180, tatCount: 12,
    ppdtObserve: 30, ppdtStory: 240, ppdtNarrate: 60, ppdtCount: 1,
    srtSeconds: 20, srtCount: 60,
    interviewSeconds: 60, interviewCount: 20, interviewPriority: "P0", interviewTopic: "All topics",
    shuffle: true, beep: true, restEnabled: false, restSeconds: 5
  }
};
let banks;
let state = structuredClone(DEFAULTS);
let customBanks = {};
let sessionHistory = [];
let session = null;
let timerHandle = null;
let targetTime = null;
let audioContext = null;
let currentView = "practice";
let modalOpen = false;
let modalType = "settings";
let customText = "";

const modes = [
  { id:"WAT", name:"Word Association Test", icon:"◉", short:"WAT", desc:"One stimulus word at a time" },
  { id:"TAT", name:"Thematic Apperception Test", icon:"▧", short:"TAT", desc:"Picture observation + story writing" },
  { id:"PPDT", name:"Picture Perception & Discussion Test", icon:"▣", short:"PPDT", desc:"Observe, write, then narrate" },
  { id:"SRT", name:"Situation Reaction Test", icon:"☷", short:"SRT", desc:"Rapid responses to situations" },
  { id:"INTERVIEW", name:"Technical Interview", icon:"⌘", short:"TECH", desc:"CSE questions from your answer book" }
];
const $ = (sel, root=document) => root.querySelector(sel);
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = sec => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s=sec%60;
  return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
};
const durLabel = sec => sec >= 60 ? `${Math.floor(sec/60)}m${sec%60 ? ` ${sec%60}s` : ""}` : `${sec}s`;
function persist() {
  localStorage.setItem("zerohour-full-settings", JSON.stringify(state));
  localStorage.setItem("zerohour-custom-banks", JSON.stringify(customBanks));
  localStorage.setItem("zerohour-session-history", JSON.stringify(sessionHistory.slice(0,40)));
}
function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem("zerohour-full-settings") || "null");
    if (s) state = {...DEFAULTS, ...s, settings:{...DEFAULTS.settings, ...(s.settings||{})}};
    customBanks = JSON.parse(localStorage.getItem("zerohour-custom-banks") || "{}");
    sessionHistory = JSON.parse(localStorage.getItem("zerohour-session-history") || "[]");
  } catch {}
}
function activeMode() { return modes.find(m=>m.id===state.mode) || modes[0]; }
function defaultBank(mode) {
  if (mode==="WAT") return banks.watBanks[0]?.id;
  if (mode==="SRT") return banks.srtBanks[0]?.id;
  if (mode==="INTERVIEW") return "cse-interview";
  if (mode==="TAT" || mode==="PPDT") return "tat-pictures";
}
function selectedBankId() { return state.bankIds?.[state.mode] || defaultBank(state.mode); }
function bankOptions(mode) {
  if (mode==="WAT") return banks.watBanks.map(b=>({id:b.id,title:b.title,source:b.source,count:b.items.length}));
  if (mode==="SRT") return banks.srtBanks.map(b=>({id:b.id,title:b.title,source:b.source,count:b.items.length,note:b.note}));
  if (mode==="INTERVIEW") return [{id:"cse-interview",title:`CSE Technical Interview (${banks.interviewItems.length} questions)`,source:"AAB_CSE_Tech_Interview_Answer_Book.pdf",count:banks.interviewItems.length}];
  if (mode==="TAT" || mode==="PPDT") return [{id:"tat-pictures",title:`TAT / PPDT Picture Bank (${banks.tatCount} pictures)`,source:"TAT and PPDT - 500 TAT+PPDT (2).pdf",count:banks.tatCount}];
  return [];
}
function getBankItems(mode, id) {
  if (customBanks[mode]?.some(b=>b.id===id)) return customBanks[mode].find(b=>b.id===id).items;
  if (mode==="WAT") return banks.watBanks.find(b=>b.id===id)?.items || banks.watBanks[0].items;
  if (mode==="SRT") return banks.srtBanks.find(b=>b.id===id)?.items || banks.srtBanks[0].items;
  if (mode==="INTERVIEW") return banks.interviewItems;
  if (mode==="TAT" || mode==="PPDT") return Array.from({length:banks.tatCount},(_,i)=>({title:`Picture ${i+1}`,page:i+1,image:`tat/${String(i+1).padStart(3,"0")}.jpg`}));
  return [];
}
function allOptions(mode) {
  return [...bankOptions(mode), ...(customBanks[mode]||[]).map(b=>({id:b.id,title:`${b.title} (custom)`,source:b.source||"Custom import",count:b.items.length}))];
}
function shuffleArray(arr) {
  const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
}
function formatElapsed(start,end) { return fmt(Math.max(0,Math.round(((end||Date.now())-start)/1000))); }

function render() {
  const m=activeMode();
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><div class="brand-shield">⬡</div><div><div class="brand-name">ZERO<span>HOUR</span></div><div class="brand-caption">SSB PRACTICE SUITE</div></div></div>
      <div class="side-label">TRAINING MODULES</div>
      <nav class="nav-list">${modes.map(x=>`<button class="nav-item ${state.mode===x.id?"active":""}" data-action="mode" data-mode="${x.id}"><span class="nav-symbol">${x.icon}</span><span class="nav-copy"><b>${x.short}</b><small>${x.name}</small></span><span class="nav-arrow">›</span></button>`).join("")}</nav>
      <div class="sidebar-divider"></div>
      <div class="side-label">WORKSPACE</div>
      <button class="nav-item ${currentView==="practice"?"active":""}" data-action="view" data-view="practice"><span class="nav-symbol">◷</span><span class="nav-copy"><b>Practice</b><small>Timed test sessions</small></span></button>
      <button class="nav-item ${currentView==="materials"?"active":""}" data-action="view" data-view="materials"><span class="nav-symbol">▤</span><span class="nav-copy"><b>Reference library</b><small>Included materials</small></span></button>
      <button class="nav-item ${currentView==="history"?"active":""}" data-action="view" data-view="history"><span class="nav-symbol">▥</span><span class="nav-copy"><b>Session history</b><small>Past practice runs</small></span></button>
      <div class="sidebar-bottom"><span class="online-dot"></span> LOCAL MODE · PRIVATE<br/><small>Practice on paper. No answer entry needed.</small></div>
    </aside>
    <main class="main">
      <header class="topbar"><div><div class="breadcrumb">ZEROHOUR / ${currentView.toUpperCase()} / <b>${esc(m.short)}</b></div><h1>${currentView==="materials"?"Reference Library":currentView==="history"?"Session History":session?(session.completed?"Session Debrief":"Live Practice"):m.name}</h1><p>${currentView==="materials"?"Question banks extracted from your uploaded reference files.":currentView==="history"?"Review completed practice sessions.":session&&!session.completed?"Paper-based practice · Focus on your answer sheet.":m.desc}</p></div><div class="top-actions"><span class="practice-pill"><span class="online-dot"></span> PRACTICE MODE</span><button class="btn btn-quiet" data-action="settings">⚙ <span>Timing settings</span></button></div></header>
      ${currentView==="materials"?renderMaterials():currentView==="history"?renderHistory():session?renderSession():renderSetup()}
      <footer class="footer"><span>ZEROHOUR // SSB PSYCHOLOGY & INTERVIEW PRACTICE</span><span>YOUR MATERIAL · YOUR PAPER · YOUR PACE</span></footer>
    </main>
    ${modalOpen?(modalType==="import"?renderImportModal():renderSettingsModal()):""}
  `;
}
function renderSetup() {
  const m=activeMode(), opts=allOptions(state.mode), bankId=selectedBankId();
  const settings=state.settings;
  const bank=opts.find(b=>b.id===bankId)||opts[0];
  let count=state.mode==="WAT"?settings.watCount:state.mode==="SRT"?settings.srtCount:state.mode==="TAT"?settings.tatCount:state.mode==="PPDT"?settings.ppdtCount:settings.interviewCount;
  let time=state.mode==="WAT"?settings.watSeconds:state.mode==="SRT"?settings.srtSeconds:state.mode==="INTERVIEW"?settings.interviewSeconds:state.mode==="TAT"?settings.tatStory:settings.ppdtStory;
  let filterHtml="";
  if(state.mode==="INTERVIEW"){
    const topics=[...new Set(banks.interviewItems.map(x=>x.topic))];
    filterHtml=`<div class="field-grid two"><label class="field"><span>Priority filter</span><select id="interviewPriority"><option value="ALL" ${settings.interviewPriority==="ALL"?"selected":""}>All priorities</option>${["P0","P1","P2","P3"].map(p=>`<option ${settings.interviewPriority===p?"selected":""}>${p}</option>`).join("")}</select></label><label class="field"><span>Topic filter</span><select id="interviewTopic"><option ${settings.interviewTopic==="All topics"?"selected":""}>All topics</option>${topics.map(t=>`<option ${settings.interviewTopic===t?"selected":""}>${esc(t)}</option>`).join("")}</select></label></div>`;
  }
  const estimate = state.mode==="TAT" ? settings.tatCount*(settings.tatObserve+settings.tatStory) : state.mode==="PPDT" ? settings.ppdtCount*(settings.ppdtObserve+settings.ppdtStory+settings.ppdtNarrate) : count*time;
  const intro = state.mode==="TAT" ? "Each picture has an observation phase followed by a timed story-writing phase." : state.mode==="PPDT" ? "Each picture runs through observation, story writing and narration phases." : state.mode==="WAT" ? "The stimulus appears on screen while you write your response on paper. The next word appears automatically." : state.mode==="SRT" ? "Read the situation, write your immediate response on paper, and move on when the timer expires." : "Answer aloud or on paper. The source answer stays hidden during the question and is available in the debrief.";
  return `<section class="stats-grid">
      <div class="stat-card"><div class="stat-label">AVAILABLE PROMPTS</div><div class="stat-number">${state.mode==="TAT"||state.mode==="PPDT"?banks.tatCount:state.mode==="INTERVIEW"?banks.interviewItems.length:(bank?.count||0).toLocaleString()}</div><div class="stat-note">${esc(bank?.title||"Choose a bank")}</div></div>
      <div class="stat-card"><div class="stat-label">DEFAULT PACE</div><div class="stat-number">${state.mode==="TAT"?durLabel(settings.tatStory):state.mode==="PPDT"?durLabel(settings.ppdtStory):durLabel(time)}<small> / item</small></div><div class="stat-note">${state.mode==="TAT"?"plus observation time":state.mode==="PPDT"?"plus observation and narration":state.mode==="INTERVIEW"?"reference answers hidden":state.mode==="SRT"?"customizable situation pace":"customizable word pace"}</div></div>
      <div class="stat-card"><div class="stat-label">ESTIMATED RUN</div><div class="stat-number">${fmt(estimate)}</div><div class="stat-note">${count} ${state.mode==="WAT"?"words":state.mode==="SRT"?"situations":state.mode==="INTERVIEW"?"questions":state.mode==="TAT"?"stories":"picture story"}</div></div>
    </section>
    <section class="setup-card">
      <div class="section-heading"><div><div class="eyebrow">MISSION CONFIGURATION</div><h2>Build your practice run</h2><p>Choose a reference bank and adjust the pace to suit your practice.</p></div><span class="lock-chip">◈ NO HINTS DURING TEST</span></div>
      <div class="setup-grid">
        <div class="setup-form">
          ${state.mode!=="TAT"&&state.mode!=="PPDT"?`<label class="field"><span>Question bank</span><select id="bankSelect">${opts.map(o=>`<option value="${esc(o.id)}" ${o.id===bankId?"selected":""}>${esc(o.title)}</option>`).join("")}</select><small>${esc(bank?.source||"")}</small></label>`:`<div class="picture-bank-note"><span class="picture-symbol">▧</span><div><b>Bundled TAT / PPDT picture bank</b><small>${banks.tatCount} picture pages extracted from your uploaded collection.</small></div></div>`}
          ${filterHtml}
          <div class="field-grid two">
            <label class="field"><span>Items in this run</span><input id="itemCount" type="number" min="1" max="${state.mode==="TAT"||state.mode==="PPDT"?banks.tatCount:state.mode==="WAT"?1000:state.mode==="SRT"?1000:1082}" value="${count}"/></label>
            <label class="field"><span>${state.mode==="WAT"?"Seconds per word":state.mode==="SRT"?"Seconds per situation":state.mode==="INTERVIEW"?"Seconds per question":state.mode==="TAT"?"Story writing time (sec)":"Story writing time (sec)"}</span><input id="itemSeconds" type="number" min="1" max="3600" value="${time}"/></label>
          </div>
          <label class="check-field"><input id="shuffle" type="checkbox" ${settings.shuffle?"checked":""}/><span><b>Shuffle question order</b><small>Creates a different run from the selected bank.</small></span></label>
          <div class="inline-settings">${state.mode==="TAT"?`<label class="field compact"><span>Observe picture (sec)</span><input id="observeSeconds" type="number" min="1" max="300" value="${settings.tatObserve}"/></label>`:""}${state.mode==="PPDT"?`<label class="field compact"><span>Observe (sec)</span><input id="observeSeconds" type="number" min="1" max="300" value="${settings.ppdtObserve}"/></label><label class="field compact"><span>Narration (sec)</span><input id="narrateSeconds" type="number" min="1" max="600" value="${settings.ppdtNarrate}"/></label>`:""}</div>
          <div class="form-actions"><button class="btn btn-primary" data-action="start">▶ Start timed session <span>→</span></button><button class="btn btn-secondary" data-action="import">＋ Add custom prompts</button></div>
        </div>
        <div class="setup-aside">
          <div class="aside-icon">${m.icon}</div><div class="eyebrow">SESSION PROTOCOL</div><h3>${esc(m.short)} <span>SIMULATION</span></h3><p>${intro}</p>
          <div class="protocol-list"><div><i>01</i><span>One prompt at a time</span></div><div><i>02</i><span>Write on paper, not in the app</span></div><div><i>03</i><span>Auto-advance when time expires</span></div><div><i>04</i><span>Review prompts after the run</span></div></div>
          <div class="source-tag">SOURCE <b>${esc(bank?.source||"Uploaded TAT/PPDT PDF")}</b></div>
        </div>
      </div>
    </section>
    <section class="below-grid">
      <div class="mini-card"><div class="mini-head"><span>◷</span><b>QUICK TIMING PRESETS</b></div><div class="preset-buttons">${(state.mode==="WAT"?[5,10,15]:state.mode==="SRT"?[15,20,30]:state.mode==="INTERVIEW"?[30,60,90]:state.mode==="TAT"?[120,180,240]:[180,240,300]).map(v=>`<button data-action="preset" data-seconds="${v}">${durLabel(v)}</button>`).join("")}</div><small>Apply a common duration to the writing/question phase.</small></div>
      <div class="mini-card"><div class="mini-head"><span>▤</span><b>REFERENCE MATERIALS</b></div><p>${banks.about.length} source groups loaded · ${banks.watBanks.reduce((a,b)=>a+b.items.length,0).toLocaleString()} WAT entries across lists · ${banks.srtBanks.reduce((a,b)=>a+b.items.length,0).toLocaleString()} SRT prompts · ${banks.interviewItems.length.toLocaleString()} CSE interview questions · ${banks.tatCount} pictures.</p><button class="text-button" data-action="view" data-view="materials">Open reference library →</button></div>
    </section>`;
}
function renderSession() {
  const s=session, item=s.items[s.index], mode=s.mode, isImage=mode==="TAT"||mode==="PPDT";
  const phaseNames={item:"WRITE YOUR RESPONSE",observe:"OBSERVE THE PICTURE",story:"STORY WRITING",narrate:"NARRATION PRACTICE",rest:"REST BREAK"};
  const phase=phaseNames[s.phase]||"PRACTICE";
  const prompt = mode==="WAT" ? item : mode==="SRT" ? item : mode==="INTERVIEW" ? item.question : item.title;
  const imageHtml=isImage?`<div class="image-stage"><img src="${esc(item.image)}" alt="${esc(item.title)}"/><div class="image-caption">${esc(item.title)} <span>· SOURCE PAGE ${item.page}</span></div></div>`:"";
  const phaseHint = mode==="WAT" ? "Write one spontaneous sentence on paper. Keep your own word-count rule." : mode==="SRT" ? "Write a short, practical response on paper. Move on without overthinking." : mode==="INTERVIEW" ? "Answer aloud as if the interviewer is in front of you. The reference answer stays hidden." : s.phase==="observe" ? "Study the picture. Do not write yet; prepare the story in your mind." : s.phase==="story" ? "Write your story on paper before the timer ends." : s.phase==="narrate" ? "Practise narrating your story clearly and briefly." : "Prepare for the next picture.";
  const answer = mode==="INTERVIEW" && s.completed ? item.answer : "";
  const totalProgress=Math.round((s.index/s.items.length)*100);
  return `<section class="live-shell">
    ${s.completed?renderDebrief():`
    <div class="live-toolbar"><div><div class="eyebrow">LIVE SESSION · ${esc(mode)}</div><div class="item-index">ITEM <b>${String(s.index+1).padStart(2,"0")}</b><span>/ ${String(s.items.length).padStart(2,"0")}</span></div></div><div class="live-status ${s.paused?"paused":""}"><span class="online-dot"></span>${s.paused?"PAUSED":"TIMER ACTIVE"}</div><button class="btn btn-quiet" data-action="end">Finish run</button></div>
    <div class="overall-progress"><div style="width:${totalProgress}%"></div></div>
    <div class="live-timer-card">
      <div class="phase-line"><span>${esc(phase)}</span><span>${s.phase!=="item"&&s.phase!=="rest"?`PHASE ${s.phase==="observe"?"1":s.phase==="story"?"2":"3"}`:"TIMED PROMPT"}</span></div>
      <div class="countdown-display ${s.remaining<=5&&!s.paused?"urgent":""}"><div class="clock-label">${s.phase==="rest"?"RESET BEFORE NEXT ITEM":mode==="WAT"?"STIMULUS WORD":mode==="SRT"?"SITUATION":mode==="INTERVIEW"?"INTERVIEW QUESTION":s.phase==="observe"?"PICTURE PROMPT":s.phase==="story"?"STORY WRITING TIME":"NARRATION TIME"}</div><div id="clockValue">${fmt(s.remaining)}</div><div class="clock-sub" id="clockSub">${s.phase==="rest"?"Take a short break":`ITEM ${s.index+1} OF ${s.items.length}`}</div></div>
      ${imageHtml}
      <div class="prompt-zone ${mode==="WAT"?"wat-prompt":""}">${mode==="INTERVIEW"?`<div class="priority-chip ${item.priority.toLowerCase()}">${esc(item.priority)} · ${esc(item.topic)}</div><div class="prompt-text">${esc(prompt)}</div>`:mode==="TAT"||mode==="PPDT"?`<div class="prompt-text small-prompt">${s.phase==="rest"?"Next picture is coming up":esc(phaseHint)}</div>`:`<div class="prompt-text">${esc(prompt)}</div><p class="prompt-instruction">${esc(phaseHint)}</p>`}
      </div>
      ${mode==="INTERVIEW"&&s.phase==="item"?`<details class="during-answer"><summary>Reveal reference answer (optional)</summary><p>${esc(item.answer)}</p></details>`:""}
      <div class="live-controls">${s.paused?`<button class="btn btn-primary" data-action="resume">▶ Resume</button>`:`<button class="btn btn-primary" data-action="pause">Ⅱ Pause timer</button>`}<button class="btn btn-secondary" data-action="reset">↻ Restart item</button><button class="btn btn-secondary" data-action="skip">Skip item →</button><button class="btn btn-quiet" data-action="mute">${state.settings.beep?"🔊 Alert on":"🔇 Alert off"}</button></div>
      <div class="time-track"><div id="timeFill" class="${s.remaining<=5?"urgent":""}" style="width:${Math.max(0,s.remaining/s.phaseDuration*100)}%"></div></div>
    </div>
    <div class="live-foot"><span><i class="online-dot"></i> Paper-based mode · No typing required</span><span>${s.index} completed <b>·</b> ${s.items.length-s.index} remaining</span></div>
    `}
  </section>`;
}
function renderDebrief() {
  const s=session;
  return `<div class="debrief-hero"><div class="debrief-check">✓</div><div><div class="eyebrow">SESSION COMPLETE</div><h2>Run debrief</h2><p>Your prompts are logged. Evaluate your handwritten answers separately by uploading scans or photos in ChatGPT.</p></div></div>
    <div class="debrief-stats"><div><span>ITEMS IN RUN</span><b>${s.items.length}</b></div><div><span>ITEMS SEEN</span><b>${s.index+1}</b></div><div><span>TIME USED</span><b>${fmt(s.elapsed||0)}</b></div><div><span>MODE</span><b>${esc(s.mode)}</b></div></div>
    <div class="debrief-actions"><button class="btn btn-primary" data-action="export">↓ Export session log</button><button class="btn btn-secondary" data-action="newrun">↻ New run</button><button class="btn btn-secondary" data-action="backsetup">Back to setup</button></div>
    <div class="question-log"><div class="log-heading"><span>SESSION PROMPTS</span><span>${s.items.length} ITEMS</span></div>${s.items.map((it,i)=>`<div class="log-row"><span class="log-num">${String(i+1).padStart(2,"0")}</span>${s.mode==="TAT"||s.mode==="PPDT"?`<img class="log-thumb" src="${esc(it.image)}" alt="Picture ${i+1}"/>`:""}<div class="log-prompt"><b>${esc(s.mode==="WAT"?it:s.mode==="SRT"?it:s.mode==="INTERVIEW"?it.question:it.title)}</b>${s.mode==="INTERVIEW"?`<details><summary>View reference answer</summary><p>${esc(it.answer)}</p><small>${esc(it.topic)} · ${esc(it.priority)}</small></details>`:s.mode==="TAT"||s.mode==="PPDT"?`<small>Source picture page ${it.page}</small>`:""}</div><span class="log-tag">SHOWN</span></div>`).join("")}</div>`;
}
function renderMaterials() {
  const sourceCards = banks.about.map(x=>`<div class="source-card"><div class="source-mark">▤</div><div><b>${esc(x.title)}</b><p>${esc(x.detail)}</p></div></div>`).join("");
  const watRows = banks.watBanks.map(b=>`<div class="bank-row"><div><b>${esc(b.title)}</b><small>${esc(b.source)}</small></div><span>${b.items.length.toLocaleString()} words</span></div>`).join("");
  const srtRows = banks.srtBanks.map(b=>`<div class="bank-row"><div><b>${esc(b.title)}</b><small>${esc(b.source)}${b.note?` · ${esc(b.note)}`:""}</small></div><span>${b.items.length} prompts</span></div>`).join("");
  return `<section class="materials-page"><div class="section-heading"><div><div class="eyebrow">UPLOADED REFERENCES</div><h2>Material-derived question banks</h2><p>The app contains extracted prompts from the PDFs you provided. Original wording is retained where text extraction permits.</p></div><button class="btn btn-secondary" data-action="import">＋ Import custom text/CSV</button></div>
    <div class="materials-summary"><div><b>${banks.watBanks.reduce((a,b)=>a+b.items.length,0).toLocaleString()}</b><span>WAT list entries</span></div><div><b>${banks.srtBanks.reduce((a,b)=>a+b.items.length,0).toLocaleString()}</b><span>SRT prompts</span></div><div><b>${banks.interviewItems.length.toLocaleString()}</b><span>CSE questions</span></div><div><b>${banks.tatCount}</b><span>TAT/PPDT pictures</span></div></div>
    <div class="library-grid"><div class="library-panel"><div class="library-title">WAT QUESTION BANKS</div>${watRows}</div><div class="library-panel"><div class="library-title">SRT QUESTION BANKS</div>${srtRows}</div></div>
    <div class="library-panel interview-library"><div class="library-title">CSE TECHNICAL INTERVIEW BANK</div><p class="muted-copy">Extracted from <b>AAB CSE Tech Interview Answer Book</b>. Each question includes its source reference answer, topic section, and priority label.</p><div class="priority-summary"><span class="p0">P0 · Must know</span><span class="p1">P1 · Strong advantage</span><span class="p2">P2 · Advanced</span><span class="p3">P3 · Rapid fire</span></div><div class="topic-cloud">${[...new Set(banks.interviewItems.map(x=>x.topic))].map(t=>`<span>${esc(t)}</span>`).join("")}</div></div>
    <div class="library-panel"><div class="library-title">SOURCE FILES INCLUDED</div><div class="source-grid">${sourceCards}</div><p class="muted-copy">TAT/PPDT pages are bundled as local picture prompts. Additional custom question lists can be imported as TXT, CSV or JSON. If you upload more PDFs to ChatGPT later, they can be used to prepare an updated app package.</p></div>
  </section>`;
}
function renderHistory() {
  if (!sessionHistory.length) return `<section class="empty-history"><div class="empty-icon">▥</div><h2>No completed sessions yet</h2><p>Your completed practice runs will appear here. Sessions are saved locally in this browser.</p><button class="btn btn-primary" data-action="view" data-view="practice">Start practising →</button></section>`;
  return `<section class="history-page"><div class="section-heading"><div><div class="eyebrow">AFTER ACTION REPORTS</div><h2>Session history</h2><p>Local record of your completed timed runs.</p></div><button class="btn btn-secondary" data-action="clearhistory">Clear history</button></div>${sessionHistory.map((h,i)=>`<div class="history-row"><div class="history-icon">${esc(h.mode)}</div><div class="history-main"><b>${esc(h.title)}</b><small>${new Date(h.date).toLocaleString()} · ${h.count} prompts</small></div><div class="history-time"><b>${fmt(h.elapsed)}</b><small>elapsed</small></div><button class="btn btn-quiet" data-action="historyexport" data-index="${i}">Export ↗</button></div>`).join("")}</section>`;
}
function renderSettingsModal() {
  const s=state.settings;
  const numField=(id,label,val,min=1,max=3600)=>`<label class="field"><span>${label}</span><input id="${id}" type="number" min="${min}" max="${max}" value="${val}"/></label>`;
  return `<div class="modal-backdrop" data-action="closemodal"><div class="settings-modal" role="dialog" aria-modal="true"><div class="modal-title"><div><div class="eyebrow">CUSTOM TIMINGS</div><h2>Practice settings</h2></div><button class="close-button" data-action="close">×</button></div>
    <div class="settings-section"><h3>WAT · Word Association</h3><div class="field-grid two">${numField("watSeconds","Seconds per word",s.watSeconds,1,120)}${numField("watCount","Words per run",s.watCount,1,1000)}</div></div>
    <div class="settings-section"><h3>TAT · Story writing</h3><div class="field-grid three">${numField("tatObserve","Observe picture (sec)",s.tatObserve,1,300)}${numField("tatStory","Story time (sec)",s.tatStory,1,3600)}${numField("tatCount","Stories per run",s.tatCount,1,banks.tatCount)}</div></div>
    <div class="settings-section"><h3>PPDT · Picture perception</h3><div class="field-grid four">${numField("ppdtObserve","Observe (sec)",s.ppdtObserve,1,300)}${numField("ppdtStory","Story (sec)",s.ppdtStory,1,3600)}${numField("ppdtNarrate","Narrate (sec)",s.ppdtNarrate,1,600)}${numField("ppdtCount","Pictures",s.ppdtCount,1,banks.tatCount)}</div></div>
    <div class="settings-section"><h3>SRT · Situation reaction</h3><div class="field-grid two">${numField("srtSeconds","Seconds per situation",s.srtSeconds,1,120)}${numField("srtCount","Situations per run",s.srtCount,1,1000)}</div></div>
    <div class="settings-section"><h3>Technical interview</h3><div class="field-grid two">${numField("interviewSeconds","Seconds per question",s.interviewSeconds,1,3600)}${numField("interviewCount","Questions per run",s.interviewCount,1,1082)}</div></div>
    <div class="settings-section"><h3>Session behaviour</h3><div class="settings-toggles"><label class="check-field"><input id="settingShuffle" type="checkbox" ${s.shuffle?"checked":""}/><span><b>Shuffle question order</b><small>Randomize selected items each run.</small></span></label><label class="check-field"><input id="settingBeep" type="checkbox" ${s.beep?"checked":""}/><span><b>Sound alert</b><small>Play a short beep when a phase ends.</small></span></label><label class="check-field"><input id="settingRest" type="checkbox" ${s.restEnabled?"checked":""}/><span><b>Rest between items</b><small>Add a short break between prompts.</small></span></label>${numField("restSeconds","Rest length (sec)",s.restSeconds,1,120)}</div></div>
    <div class="modal-actions"><button class="btn btn-secondary" data-action="close">Cancel</button><button class="btn btn-primary" data-action="saveSettings">Save settings</button></div>
  </div></div>`;
}
function getFilteredInterviewItems() {
  const s=state.settings;
  return banks.interviewItems.filter(q=>(s.interviewPriority==="ALL"||q.priority===s.interviewPriority)&&(s.interviewTopic==="All topics"||q.topic===s.interviewTopic));
}
function startSession() {
  const mode=state.mode, s=state.settings;
  if (session && !session.completed) stopTimer();
  let items=[];
  if (mode==="WAT"||mode==="SRT") {
    const id=selectedBankId();
    items=[...getBankItems(mode,id)];
  } else if (mode==="INTERVIEW") items=getFilteredInterviewItems();
  else items=getBankItems(mode,"tat-pictures");
  if (s.shuffle) items=shuffleArray(items);
  const count=Math.max(1,Number(mode==="WAT"?s.watCount:mode==="SRT"?s.srtCount:mode==="TAT"?s.tatCount:mode==="PPDT"?s.ppdtCount:s.interviewCount)||1);
  items=items.slice(0,Math.min(count,items.length));
  if (!items.length) { alert("No prompts available in this bank/filter. Choose another bank or priority."); return; }
  const now=Date.now();
  session={mode,items,index:0,phase:initialPhase(mode),remaining:0,phaseDuration:0,paused:false,completed:false,startedAt:now,endedAt:null,elapsed:0,bankId:selectedBankId()};
  currentView="practice";
  startPhase(session.phase);
  persist();
}
function initialPhase(mode) { return mode==="TAT"||mode==="PPDT"?"observe":"item"; }
function phaseSeconds(mode,phase) {
  const s=state.settings;
  if (phase==="rest") return s.restSeconds;
  if (mode==="WAT") return s.watSeconds;
  if (mode==="SRT") return s.srtSeconds;
  if (mode==="INTERVIEW") return s.interviewSeconds;
  if (mode==="TAT") return phase==="observe"?s.tatObserve:s.tatStory;
  if (mode==="PPDT") return phase==="observe"?s.ppdtObserve:phase==="story"?s.ppdtStory:s.ppdtNarrate;
  return 10;
}
function startPhase(phase) {
  if (!session) return;
  session.phase=phase;
  session.phaseDuration=phaseSeconds(session.mode,phase);
  session.remaining=session.phaseDuration;
  session.paused=false;
  targetTime=Date.now()+session.remaining*1000;
  stopTimer(false);
  timerHandle=setInterval(tick,100);
  render();
}
function stopTimer(clearTarget=true) {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle=null;
  if (clearTarget) targetTime=null;
}
function tick() {
  if (!session||session.completed||session.paused||targetTime===null) return;
  session.remaining=Math.max(0,Math.ceil((targetTime-Date.now())/1000));
  session.elapsed=Math.floor((Date.now()-session.startedAt)/1000);
  const clock=$("#clockValue"), fill=$("#timeFill"), sub=$("#clockSub");
  if(clock) clock.textContent=fmt(session.remaining);
  if(fill){fill.style.width=`${session.remaining/session.phaseDuration*100}%`;fill.classList.toggle("urgent",session.remaining<=5);}
  if(clock) clock.parentElement.classList.toggle("urgent",session.remaining<=5);
  if(sub) sub.textContent=session.phase==="rest"?"Take a short break":`ITEM ${session.index+1} OF ${session.items.length}`;
  const elapsedLabel=$("#elapsedLive"); if(elapsedLabel) elapsedLabel.textContent=fmt(session.elapsed);
  if(session.remaining<=0){stopTimer();if(state.settings.beep)beep();timerEnded();}
}
function beep() {
  try {
    audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioContext.createOscillator(), gain=audioContext.createGain();
    osc.connect(gain);gain.connect(audioContext.destination);osc.frequency.value=880;
    gain.gain.setValueAtTime(.12,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.22);
    osc.start();osc.stop(audioContext.currentTime+.23);
  } catch {}
}
function timerEnded() {
  if(!session)return;
  const m=session.mode,p=session.phase;
  if(p==="rest"){moveToNextItem();return;}
  if(m==="TAT"&&p==="observe"){startPhase("story");return;}
  if(m==="PPDT"&&p==="observe"){startPhase("story");return;}
  if(m==="PPDT"&&p==="story"){startPhase("narrate");return;}
  if(state.settings.restEnabled&&session.index<session.items.length-1){startPhase("rest");return;}
  moveToNextItem();
}
function moveToNextItem() {
  if(!session)return;
  if(session.index+1>=session.items.length){completeSession();return;}
  session.index++;
  startPhase(initialPhase(session.mode));
}
function completeSession() {
  stopTimer();
  session.completed=true;session.paused=false;session.endedAt=Date.now();session.elapsed=Math.floor((session.endedAt-session.startedAt)/1000);
  const hist={id:`${session.endedAt}`,mode:session.mode,title:activeMode().name,count:session.items.length,elapsed:session.elapsed,date:new Date(session.endedAt).toISOString(),items:session.items,bankId:session.bankId};
  sessionHistory.unshift(hist);sessionHistory=sessionHistory.slice(0,40);persist();render();
}
function pauseSession() {
  if(!session||session.completed)return;
  session.remaining=Math.max(0,Math.ceil((targetTime-Date.now())/1000));session.paused=true;stopTimer();render();
}
function resumeSession() {
  if(!session||session.completed)return;
  session.paused=false;targetTime=Date.now()+session.remaining*1000;timerHandle=setInterval(tick,100);render();
}
function resetItem() {
  if(!session||session.completed)return;
  startPhase(session.phase==="rest"?initialPhase(session.mode):session.phase);
}
function skipItem() {
  if(!session||session.completed)return;
  if(state.settings.restEnabled&&session.index<session.items.length-1)startPhase("rest");
  else moveToNextItem();
}
function endSession() {
  if(!session||session.completed)return;
  if(!confirm("Finish this session now and open the debrief?"))return;
  completeSession();
}
function saveSettings() {
  const number=(id,old,min=1,max=3600)=>Math.max(min,Math.min(max,Number($("#"+id)?.value)||old));
  const s=state.settings;
  Object.assign(s,{
    watSeconds:number("watSeconds",s.watSeconds,1,120),watCount:number("watCount",s.watCount,1,1000),
    tatObserve:number("tatObserve",s.tatObserve,1,300),tatStory:number("tatStory",s.tatStory,1,3600),tatCount:number("tatCount",s.tatCount,1,banks.tatCount),
    ppdtObserve:number("ppdtObserve",s.ppdtObserve,1,300),ppdtStory:number("ppdtStory",s.ppdtStory,1,3600),ppdtNarrate:number("ppdtNarrate",s.ppdtNarrate,1,600),ppdtCount:number("ppdtCount",s.ppdtCount,1,banks.tatCount),
    srtSeconds:number("srtSeconds",s.srtSeconds,1,120),srtCount:number("srtCount",s.srtCount,1,1000),
    interviewSeconds:number("interviewSeconds",s.interviewSeconds,1,3600),interviewCount:number("interviewCount",s.interviewCount,1,1082),
    restSeconds:number("restSeconds",s.restSeconds,1,120),
    shuffle:$("#settingShuffle").checked,beep:$("#settingBeep").checked,restEnabled:$("#settingRest").checked
  });
  modalOpen=false;persist();render();
}
function exportSession(s=session) {
  if(!s)return;
  const rows=s.items.map((it,i)=>({number:i+1,mode:s.mode,prompt:s.mode==="WAT"?it:s.mode==="SRT"?it:s.mode==="INTERVIEW"?it.question:it.title,referenceAnswer:s.mode==="INTERVIEW"?it.answer:"",topic:s.mode==="INTERVIEW"?it.topic:"",priority:s.mode==="INTERVIEW"?it.priority:"",sourcePage:it.page||""}));
  const blob=new Blob([JSON.stringify({title:activeMode().name,mode:s.mode,startedAt:new Date(s.startedAt).toISOString(),elapsedSeconds:s.elapsed,items:rows},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`zerohour-${s.mode.toLowerCase()}-${Date.now()}.json`;a.click();URL.revokeObjectURL(url);
}
function parseImportedText(text, filename) {
  let items=[];
  if(filename.toLowerCase().endsWith(".json")){
    try {const x=JSON.parse(text);items=Array.isArray(x)?x:(x.items||x.questions||x.prompts||[]);items=items.map(v=>typeof v==="string"?v:(v.prompt||v.question||v.word||JSON.stringify(v))).filter(Boolean);}
    catch {items=[];}
  } else {
    items=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>line.replace(/^\s*(?:\d{1,4}\s*[.)]|[-•*])\s*/,"").trim()).filter(Boolean);
    if(filename.toLowerCase().endsWith(".csv"))items=items.map(x=>x.split(",")[0].replace(/^["']|["']$/g,"").trim()).filter(Boolean);
  }
  return items;
}
function importPrompts() {
  const name=($("#customBankName")?.value||"Custom question set").trim();
  const raw=$("#customPromptText")?.value||"";
  const items=parseImportedText(raw,".txt");
  if(!items.length){alert("Paste one prompt per line or choose a TXT/CSV/JSON file.");return;}
  const mode=state.mode,id=`custom-${Date.now()}`;
  customBanks[mode]=customBanks[mode]||[];
  customBanks[mode].push({id,title:name,source:"Custom import",items});
  state.bankIds=state.bankIds||{};state.bankIds[mode]=id;
  modalOpen=false;persist();render();
}
function openImport() {
  modalOpen=true;modalType="import";customText="";
  render();
}
function readImportFile(file) {
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{const text=String(reader.result||"");const items=parseImportedText(text,file.name);$("#customPromptText").value=items.join("\n");if(!$("#customBankName").value)$("#customBankName").value=file.name.replace(/\.[^.]+$/,"");};
  reader.readAsText(file);
}
function renderImportModal() {
  return `<div class="modal-backdrop" data-action="closemodal"><div class="settings-modal import-modal" role="dialog" aria-modal="true"><div class="modal-title"><div><div class="eyebrow">CUSTOM QUESTION BANK</div><h2>Add your own prompts</h2></div><button class="close-button" data-action="close">×</button></div><p>Paste one word, situation, or question per line, or import a TXT, CSV or JSON file. Your uploaded reference PDFs are already built into the default banks.</p><label class="field"><span>Bank name</span><input id="customBankName" placeholder="e.g. WAT Set — difficult words"/></label><label class="field"><span>Import text file</span><input id="importFile" type="file" accept=".txt,.csv,.json,text/plain,text/csv,application/json"/></label><label class="field"><span>Prompts (one per line)</span><textarea id="customPromptText" rows="10" placeholder="Tenacity&#10;Anger&#10;Meticulous"></textarea></label><div class="modal-actions"><button class="btn btn-secondary" data-action="close">Cancel</button><button class="btn btn-primary" data-action="importSave">Save question bank</button></div></div></div>`;
}
function setMode(mode) {
  if(session&&!session.completed){if(!confirm("Leave the active session? The current run will end."))return;stopTimer();session=null;}
  state.mode=mode;currentView="practice";modalOpen=false;persist();render();
}
function setView(view) {
  if(session&&!session.completed){if(!confirm("Leave the active session? The current run will end."))return;stopTimer();session=null;}
  currentView=view;modalOpen=false;render();
}
function handleAction(action,el) {
  switch(action){
    case "mode":setMode(el.dataset.mode);break;
    case "view":setView(el.dataset.view);break;
    case "settings":modalOpen=true;modalType="settings";render();break;
    case "close":modalOpen=false;render();break;
    case "closemodal":if(el.classList.contains("modal-backdrop")){modalOpen=false;render();}break;
    case "saveSettings":saveSettings();break;
    case "start":{
      const bankSel=$("#bankSelect");if(bankSel){state.bankIds=state.bankIds||{};state.bankIds[state.mode]=bankSel.value;}
      const s=state.settings;
      if(state.mode==="WAT"){s.watCount=Math.max(1,Number($("#itemCount").value)||60);s.watSeconds=Math.max(1,Number($("#itemSeconds").value)||10);}
      if(state.mode==="SRT"){s.srtCount=Math.max(1,Number($("#itemCount").value)||60);s.srtSeconds=Math.max(1,Number($("#itemSeconds").value)||20);}
      if(state.mode==="INTERVIEW"){s.interviewCount=Math.max(1,Number($("#itemCount").value)||20);s.interviewSeconds=Math.max(1,Number($("#itemSeconds").value)||60);s.interviewPriority=$("#interviewPriority").value;s.interviewTopic=$("#interviewTopic").value;}
      if(state.mode==="TAT"){s.tatCount=Math.max(1,Number($("#itemCount").value)||12);s.tatStory=Math.max(1,Number($("#itemSeconds").value)||180);s.tatObserve=Math.max(1,Number($("#observeSeconds").value)||30);}
      if(state.mode==="PPDT"){s.ppdtCount=Math.max(1,Number($("#itemCount").value)||1);s.ppdtStory=Math.max(1,Number($("#itemSeconds").value)||240);s.ppdtObserve=Math.max(1,Number($("#observeSeconds").value)||30);s.ppdtNarrate=Math.max(1,Number($("#narrateSeconds").value)||60);}
      s.shuffle=$("#shuffle").checked;persist();startSession();break;
    }
    case "preset":{
      const v=Number(el.dataset.seconds),s=state.settings;
      if(state.mode==="WAT")s.watSeconds=v;else if(state.mode==="SRT")s.srtSeconds=v;else if(state.mode==="INTERVIEW")s.interviewSeconds=v;else if(state.mode==="TAT")s.tatStory=v;else if(state.mode==="PPDT")s.ppdtStory=v;
      persist();render();break;
    }
    case "pause":pauseSession();break;
    case "resume":resumeSession();break;
    case "reset":resetItem();break;
    case "skip":skipItem();break;
    case "end":endSession();break;
    case "mute":state.settings.beep=!state.settings.beep;persist();render();break;
    case "newrun":session=null;startSession();break;
    case "backsetup":session=null;render();break;
    case "export":exportSession();break;
    case "historyexport":{const h=sessionHistory[Number(el.dataset.index)];if(h)exportSession({mode:h.mode,items:h.items,index:h.items.length-1,elapsed:h.elapsed,startedAt:Date.parse(h.date)-h.elapsed*1000,completed:true});break;}
    case "clearhistory":if(confirm("Clear all saved session history?")){sessionHistory=[];persist();render();}break;
    case "import":openImport();break;
    case "importSave":importPrompts();break;
  }
}
app.addEventListener("click", e=>{
  const el=e.target.closest("[data-action]");if(!el)return;
  const action=el.dataset.action;
  if(action==="closemodal" && e.target!==el)return;
  handleAction(action,el);
});
app.addEventListener("change", e=>{
  if(e.target.id==="importFile")readImportFile(e.target.files?.[0]);
});
app.addEventListener("input", e=>{
  if(e.target.id==="customPromptText"){customText=e.target.value;}
});

loadSaved();
fetch("data/banks.json").then(r=>{if(!r.ok)throw new Error("Could not load reference banks");return r.json();}).then(data=>{
  banks=data;
  // A custom import can be selected even if the browser saved a bank from an earlier session.
  if(!state.bankIds)state.bankIds={};
  render();
}).catch(err=>{
  app.innerHTML=`<div class="load-error"><h1>ZeroHour could not load its reference banks</h1><p>Run this folder through a local server rather than opening index.html directly.</p><code>python -m http.server 8000</code><p>Then open <b>http://localhost:8000</b>.</p><small>${esc(err.message)}</small></div>`;
});
