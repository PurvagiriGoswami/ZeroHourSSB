# ZeroHourSSB

> **ZeroHour SSB — The Ultimate Services Selection Board Practice Suite (v3.0)**  
> Built for Indian Armed Forces aspirants preparing for Army, Navy, and Air Force SSB interviews.

---

## 🌟 Overview

**ZeroHour SSB** is a modern, high-performance, browser-based SSB simulator and practice platform. Designed with a **paper-first** approach matching the real SSB psychology testing environment, it bridges the gap between casual study and real exam discipline.

ZeroHour v3 introduces a complete visual overhaul featuring **cyber-military glassmorphism**, animated background particle physics, dedicated **Practice vs Real SSB Exam modes**, a motivational **Dashboard**, in-depth **Personal Analytics**, multiple **curated test sets for WAT, TAT, PPDT, and SRT**, and user-customizable **Themes and Settings**.

---

## 🚀 Key Features

### 1. 🎯 Dual Modes: Practice Mode vs Real SSB Exam Mode
- **Real SSB Exam Mode**:
  - **WAT**: Strict 15 seconds per word, 60 words continuously. No pausing allowed.
  - **TAT**: 12 pictures (11 real stimuli + 1 official blank slide). Exactly 30 seconds observation followed by 4 minutes story writing per picture. Picture automatically vanishes during story phase.
  - **PPDT**: 30 seconds observation, 1 minute box details marking + 4 minutes story writing, followed by 1 minute narration practice.
  - **SRT**: 60 situations in 30 minutes (30 seconds per situation).
  - Screen locked with pulsing crimson exam indicators, countdown urgency warnings, and official protocol adherence.
- **Practice Mode**:
  - Full control: pause, resume, skip, restart prompts.
  - Adjustable timing presets (e.g. 5s, 10s, 15s for WAT; 15s, 20s, 30s for SRT).
  - Rest breaks between items.
  - Randomize / shuffle or sequential prompt delivery.

### 2. 📊 Command Dashboard & Analytics
- **Hero Greeting & Daily Motivation**: Curated military quotes rotated daily.
- **Today's Session Counter & Goal Ring**: Visual circular progress tracking against your customizable daily session goal.
- **Day Streak Counter**: Flame badge 🔥 tracking consecutive practice days.
- **Activity Heatmap**: 35-day GitHub-style consistency calendar showing your practice frequency.
- **Weekly Mode Distribution**: Color-coded bar chart tracking practice balance across WAT, TAT, PPDT, SRT, and Technical Interview.
- **Debrief Reflection & Focus Cloud**: Track self-ratings (1–5 stars), focus areas (e.g., composure, narration, clarity), and notes.

### 3. 📚 Curated Practice Sets
- **Word Association Test (WAT)**:
  - *WAT Exam Set 1* — 60 High-Frequency Officer Like Qualities (OLQ) Words
  - *WAT Exam Set 2* — 60 Psychological & Emotional Balance Words
  - *WAT Exam Set 3* — 60 Leadership & Action Words
  - *WAT Exam Set 4* — 60 Social & Interpersonal Dynamics Words
  - *WAT Exam Set 5* — 60 Crisis & Resilience Words
  - *WAT Master Bank* (641 Words)
  - *WAT 500 Sample Words* (500 Words)
  - *WAT 200 Words* (200 Words)
- **Thematic Apperception Test (TAT)**:
  - 8 Standard 12-Slide Exam Sets (11 Pictures + 1 Official Blank Slide each)
  - Full Picture Library containing **467 high-resolution historical SSB stimuli**
  - Realistic **Blank Slide (Slide 12)** simulation where candidates imagine their own scene
- **Picture Perception & Discussion Test (PPDT)**:
  - 8 Curated Stage-1 Screening Sets (Rural Welfare, Emergency Rescue, Youth Adventure, Workplace Dynamics, Conflict Resolution, etc.)
  - Full 467-picture screening bank
- **Situation Reaction Test (SRT)**:
  - *SRT Exam Set 1* — 60 Situations (Crisis & Incident Response)
  - *SRT Exam Set 2* — 60 Situations (Leadership & Duty)
  - *SRT Exam Set 3* — 60 Situations (Physical Courage & Emergency)
  - *SRT Exam Set 4* — 60 Situations (Social & Practical Decision Making)
  - *SRT 180 Comprehensive Collection*
- **Technical & CSE Interview**:
  - 1,082 technical interview prompts with priority tags (P0, P1, P2, P3), topics, and collapsible reference answers.

### 4. ⚙️ User Customization & Aesthetics
- **6 Handcrafted Themes**:
  - **Midnight** — Deep cyber-navy & teal glow (Default)
  - **Military** — Tactical olive green & forest camo tones
  - **Ocean** — Royal navy & bright sky cyan
  - **Ember** — Warm charcoal & crimson amber
  - **Stealth** — OLED pure black & platinum minimalist
  - **Aurora** — Deep violet & neon purple/magenta
- **Display Customization**: Small, Medium, Large typography scaling.
- **Dynamic Particle Effects**: Interactive canvas background particle network.
- **Sound Alerts**: Web Audio API beeps on timer expiration (no external audio assets needed).
- **Keyboard Shortcuts**: <kbd>Space</kbd> to pause/resume, <kbd>→</kbd> to skip, <kbd>R</kbd> to restart item.
- **Backup & Restore**: Export and import complete session history, custom banks, and settings as JSON.
- **Local & Offline**: All user data resides in `localStorage`. 100% private with zero telemetry.

---

## 🛠️ How to Run Locally

Because ZeroHour fetches question banks from local JSON (`data/banks.json`), it should be served via a lightweight local HTTP server rather than opened via `file://`.

### Windows Quick Start:
Double-click `Run-Localhost-Windows.bat` in this folder, or run:
```cmd
python -m http.server 8000
```
Then navigate to: **http://localhost:8000** in your browser.

### macOS / Linux:
```bash
python3 -m http.server 8000
```
Then open: **http://localhost:8000**

---

## 📝 The Paper-First Protocol

SSB Psychology and Screening tests are strictly paper-based examinations:
1. **Prepare Pen and Paper**: Have a notebook or blank A4 sheets ready before launching a test.
2. **Observe**: When the stimulus appears, observe the details within the allocated time.
3. **Write Spontaneously**: When the timer starts, write your story or reaction on paper. Do not pause.
4. **Debrief**: In the review screen, evaluate your responses, mark your self-rating, and add personal notes.

---

## 📁 Repository Structure

```
ZeroHourSSB/
├── index.html                   # Main entry point with accessibility and SEO meta tags
├── styles.css                   # Base stylesheet
├── styles.v2.css                # Layout utilities
├── styles.v3.css                # Premium v3 glassmorphism, themes & responsive styles
├── app.js                       # Legacy v1 logic (preserved for backward compatibility)
├── app.v2.js                    # Legacy v2 logic (preserved for backward compatibility)
├── app.v3.js                    # ZeroHour v3 suite (Dashboard, Modes, Sets, Analytics, Audio, Particles)
├── Run-Localhost-Windows.bat    # 1-click Windows localhost launcher
├── README.md                    # Project documentation
├── .gitignore                   # Excludes temporary extracted archives
├── data/
│   ├── banks.json               # Word banks, SRT collections, interview questions (360 KB)
│   └── stimuli-manifest.json    # Image metadata and provenance records (375 KB)
├── tat/                         # 467 processed high-resolution TAT/PPDT picture stimuli (10.1 MB)
├── materials/
│   └── reports/                 # Extraction inventories and audit manifests
└── tools/                       # Processing and verification scripts
```

---

## 👤 Author

Developed by **[Purvagiri Goswami](https://github.com/PurvagiriGoswami)**.  
Dedicated to all defence aspirants striving to wear the uniform and serve the nation.

*Jai Hind! 🇮🇳*
