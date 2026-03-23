/**
 * QUIZ ZONE — script.js
 * ─────────────────────────────────────────────
 * Architecture:
 *  1.  QUESTION BANK      — categorized, difficulty-tagged data
 *  2.  STATE              — single source of truth object
 *  3.  CONFIG             — read from UI controls at quiz start
 *  4.  UTILITIES          — pure functions (shuffle, buildQuiz, calcPoints, sound)
 *  5.  SCREEN MANAGER     — showScreen(id)
 *  6.  RENDER LAYER       — render* functions that read from state/DOM
 *  7.  GAME LOGIC         — startQuiz, showQuestion, handleAnswerClick, showResults
 *  8.  REVIEW SCREEN      — renderReviewScreen
 *  9.  THEME TOGGLE       — Noir / Light mode switcher
 * 10.  FLOATING CONTROLS  — Sound + Blind icon buttons
 * 11.  EVENT WIRING       — all event listeners at bottom
 */

"use strict";

/* ─────────────────────────────────────────────
   1. QUESTION BANK
   ───────────────────────────────────────────── */

/** @type {Record<string, Array<{question:string, answers:{text:string,correct:boolean}[], difficulty:'easy'|'medium'|'hard'}>>} */
const questionBank = {
  geography: [
    { difficulty:"easy",   question:"What is the capital of France?",           answers:[{text:"London",correct:false},{text:"Berlin",correct:false},{text:"Paris",correct:true},{text:"Madrid",correct:false}] },
    { difficulty:"easy",   question:"Which continent is Brazil in?",            answers:[{text:"Africa",correct:false},{text:"South America",correct:true},{text:"North America",correct:false},{text:"Europe",correct:false}] },
    { difficulty:"easy",   question:"What is the largest ocean on Earth?",      answers:[{text:"Atlantic",correct:false},{text:"Indian",correct:false},{text:"Arctic",correct:false},{text:"Pacific",correct:true}] },
    { difficulty:"medium", question:"What is the capital of Australia?",        answers:[{text:"Sydney",correct:false},{text:"Melbourne",correct:false},{text:"Canberra",correct:true},{text:"Brisbane",correct:false}] },
    { difficulty:"medium", question:"Which country has the most natural lakes?",answers:[{text:"USA",correct:false},{text:"Russia",correct:false},{text:"Canada",correct:true},{text:"Brazil",correct:false}] },
    { difficulty:"hard",   question:"What is the smallest country by area?",    answers:[{text:"Monaco",correct:false},{text:"San Marino",correct:false},{text:"Vatican City",correct:true},{text:"Liechtenstein",correct:false}] },
  ],
  science: [
    { difficulty:"easy",   question:"Which planet is known as the Red Planet?", answers:[{text:"Venus",correct:false},{text:"Mars",correct:true},{text:"Jupiter",correct:false},{text:"Saturn",correct:false}] },
    { difficulty:"easy",   question:"What is the chemical symbol for gold?",    answers:[{text:"Go",correct:false},{text:"Gd",correct:false},{text:"Au",correct:true},{text:"Ag",correct:false}] },
    { difficulty:"easy",   question:"How many bones are in the adult human body?", answers:[{text:"196",correct:false},{text:"206",correct:true},{text:"216",correct:false},{text:"226",correct:false}] },
    { difficulty:"medium", question:"What is the speed of light (approx)?",     answers:[{text:"200,000 km/s",correct:false},{text:"300,000 km/s",correct:true},{text:"400,000 km/s",correct:false},{text:"150,000 km/s",correct:false}] },
    { difficulty:"medium", question:"What gas do plants absorb from the air?",  answers:[{text:"Oxygen",correct:false},{text:"Nitrogen",correct:false},{text:"Carbon Dioxide",correct:true},{text:"Hydrogen",correct:false}] },
    { difficulty:"hard",   question:"What is the atomic number of Carbon?",     answers:[{text:"4",correct:false},{text:"6",correct:true},{text:"8",correct:false},{text:"12",correct:false}] },
  ],
  popCulture: [
    { difficulty:"easy",   question:"Which of these is NOT a programming language?", answers:[{text:"Java",correct:false},{text:"Python",correct:false},{text:"Banana",correct:true},{text:"JavaScript",correct:false}] },
    { difficulty:"easy",   question:"What is the best-selling video game of all time?", answers:[{text:"Tetris",correct:false},{text:"GTA V",correct:false},{text:"Minecraft",correct:true},{text:"Wii Sports",correct:false}] },
    { difficulty:"easy",   question:"Which streaming service created Stranger Things?", answers:[{text:"HBO",correct:false},{text:"Netflix",correct:true},{text:"Disney+",correct:false},{text:"Amazon",correct:false}] },
    { difficulty:"medium", question:"Who directed the movie 'Inception'?",      answers:[{text:"Ridley Scott",correct:false},{text:"J.J. Abrams",correct:false},{text:"Christopher Nolan",correct:true},{text:"Steven Spielberg",correct:false}] },
    { difficulty:"medium", question:"What year was the first iPhone released?", answers:[{text:"2005",correct:false},{text:"2006",correct:false},{text:"2007",correct:true},{text:"2008",correct:false}] },
    { difficulty:"hard",   question:"Who composed the 'Ode to Joy'?",           answers:[{text:"Mozart",correct:false},{text:"Bach",correct:false},{text:"Beethoven",correct:true},{text:"Chopin",correct:false}] },
  ],
  tech: [
    { difficulty:"easy",   question:"What does 'HTML' stand for?",              answers:[{text:"Hyper Text Markup Language",correct:true},{text:"High Tech Modern Language",correct:false},{text:"Hyper Transfer Markup Logic",correct:false},{text:"Home Tool Markup Language",correct:false}] },
    { difficulty:"easy",   question:"Which language runs natively in browsers?", answers:[{text:"Python",correct:false},{text:"Java",correct:false},{text:"JavaScript",correct:true},{text:"Ruby",correct:false}] },
    { difficulty:"medium", question:"What does CSS stand for?",                 answers:[{text:"Computer Style Sheets",correct:false},{text:"Cascading Style Sheets",correct:true},{text:"Creative Styling System",correct:false},{text:"Code Style System",correct:false}] },
    { difficulty:"medium", question:"Which data structure uses LIFO?",          answers:[{text:"Queue",correct:false},{text:"Stack",correct:true},{text:"Tree",correct:false},{text:"Graph",correct:false}] },
    { difficulty:"hard",   question:"What is the time complexity of binary search?", answers:[{text:"O(n)",correct:false},{text:"O(n²)",correct:false},{text:"O(log n)",correct:true},{text:"O(1)",correct:false}] },
    { difficulty:"hard",   question:"What does SQL stand for?",                 answers:[{text:"Structured Query Language",correct:true},{text:"Simple Question Language",correct:false},{text:"Stored Queue Logic",correct:false},{text:"Sequential Query Logic",correct:false}] },
  ],
};

/* Merge all categories for "all mix" option */
const allQuestions = Object.values(questionBank).flat();


/* ─────────────────────────────────────────────
   2. STATE — single source of truth
   ───────────────────────────────────────────── */

const state = {
  questions:           [],      // current quiz question array
  currentIndex:        0,       // current question index
  score:               0,       // current raw score (includes multiplier)
  streak:              0,       // consecutive correct answers
  maxStreak:           0,       // peak streak this round
  multiplier:          1,       // current combo multiplier
  maxMultiplier:       1,       // peak multiplier this round
  answersDisabled:     false,   // lock answers after selection
  timerInterval:       null,    // setInterval handle for 1s ticks
  stopwatchInterval:   null,    // setInterval handle for 50ms stopwatch ticks
  timeLeft:            15,      // seconds remaining for current question
  timeLeftMs:          0,       // extra ms precision for stopwatch (0–99)
  totalTimeLeft:       0,       // accumulated time left across answered questions
  lifelineUsed:        false,   // 50/50 lifeline used this quiz
  lifelineHalved:      false,   // points halved this question due to lifeline
  blindMode:           false,   // hide correct/wrong highlights
  timerEnabled:        true,    // timer feature on/off
  soundEnabled:        true,    // sound on/off
  noirMode:            false,   // Noir / dark theme active
  history:             [],      // [{question, selectedText, correctText, wasCorrect, timedOut}]
  audioCtx:            null,    // lazy AudioContext
};

/** Update state safely */
function setState(key, value) {
  state[key] = value;
}


/* ─────────────────────────────────────────────
   3. CONFIG — read from DOM controls
   ───────────────────────────────────────────── */

/** Read all start-screen controls and return a config object */
function readConfig() {
  return {
    category:     document.getElementById("category-select").value,
    difficulty:   document.getElementById("difficulty-select").value,
    timerEnabled: document.getElementById("timer-toggle").checked,
    blindMode:    state.blindMode,    // driven by float-ctrl, not a checkbox
    soundEnabled: state.soundEnabled, // driven by float-ctrl, not a checkbox
  };
}


/* ─────────────────────────────────────────────
   4. UTILITIES
   ───────────────────────────────────────────── */

/**
 * Fisher-Yates shuffle — returns a NEW shuffled array.
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a quiz from pool based on difficulty preset.
 * Also shuffles answers within each question.
 */
function buildQuiz(pool, difficulty = "all", total = 10) {
  const easy   = shuffle(pool.filter(q => q.difficulty === "easy"));
  const medium = shuffle(pool.filter(q => q.difficulty === "medium"));
  const hard   = shuffle(pool.filter(q => q.difficulty === "hard"));

  let composed;
  if (difficulty === "all" || difficulty === "easy") {
    composed = [
      ...easy.slice(0,   Math.round(total * 0.70)),
      ...medium.slice(0, Math.round(total * 0.25)),
      ...hard.slice(0,   Math.ceil(total  * 0.05)),
    ];
  } else if (difficulty === "medium") {
    composed = [
      ...easy.slice(0,   Math.round(total * 0.30)),
      ...medium.slice(0, Math.round(total * 0.50)),
      ...hard.slice(0,   Math.round(total * 0.20)),
    ];
  } else if (difficulty === "hard") {
    composed = [
      ...easy.slice(0,   Math.round(total * 0.10)),
      ...medium.slice(0, Math.round(total * 0.30)),
      ...hard.slice(0,   Math.round(total * 0.60)),
    ];
  }

  return shuffle(composed.slice(0, total)).map(q => ({
    ...q,
    answers: shuffle(q.answers),
  }));
}

/**
 * Calculate points for a correct answer.
 * BASE = 100, multiplied by combo multiplier, plus time bonus.
 * If lifeline was used, cap the earned points at 50% of what would have been earned.
 */
function calcPoints(timeLeft, multiplier) {
  const base      = 100;
  const timeBonus = state.timerEnabled ? Math.floor(timeLeft / 3) * 10 : 0;
  const raw       = base * multiplier + timeBonus;
  // Lifeline 50/50 cost: halve the maximum points for this question
  return state.lifelineHalved ? Math.floor(raw * 0.5) : raw;
}

/**
 * Determine combo multiplier from streak.
 * ×1 default, ×2 at 3+, ×3 at 5+, ×4 at 8+
 */
function streakToMultiplier(streak) {
  if (streak >= 8) return 4;
  if (streak >= 5) return 3;
  if (streak >= 3) return 2;
  return 1;
}


/* ─────────────────────────────────────────────
   WEB AUDIO API — synthesized sound effects
   ───────────────────────────────────────────── */

function getAudioCtx() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return state.audioCtx;
}

function playTone(freq, duration, type = "sine", vol = 0.25) {
  if (!state.soundEnabled) return;
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) { /* silently ignore AudioContext errors */ }
}

const sfx = {
  correct:  () => playTone(660, 0.18, "sine",   0.28),
  wrong:    () => { playTone(180, 0.25, "square", 0.2); },
  combo:    () => { playTone(880, 0.12, "sine", 0.25); setTimeout(() => playTone(1100, 0.15, "sine", 0.2), 100); },
  timeout:  () => playTone(150, 0.4, "sawtooth", 0.18),
  lifeline: () => { playTone(300, 0.1, "sine", 0.2); setTimeout(() => playTone(200, 0.2, "sine", 0.15), 120); },
  start:    () => { playTone(440, 0.1, "sine", 0.2); setTimeout(() => playTone(550, 0.1, "sine", 0.2), 120); setTimeout(() => playTone(660, 0.15, "sine", 0.2), 240); },
  newBest:  () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.18, "sine", 0.22), i * 110)); },
};


/* ─────────────────────────────────────────────
   5. SCREEN MANAGER
   ───────────────────────────────────────────── */

const allScreens = document.querySelectorAll(".screen");

function showScreen(id) {
  allScreens.forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}


/* ─────────────────────────────────────────────
   6. RENDER LAYER
   ───────────────────────────────────────────── */

/** Update the HUD score, question counter, and combo badge */
function renderHUD() {
  document.getElementById("score").textContent            = state.score;
  document.getElementById("current-question").textContent = state.currentIndex + 1;
  document.getElementById("total-questions").textContent  = state.questions.length;

  const comboBlock   = document.getElementById("combo-block");
  const comboDisplay = document.getElementById("combo-display");

  if (state.multiplier > 1) {
    comboBlock.style.display = "flex";
    comboDisplay.textContent = `×${state.multiplier}`;
  } else {
    comboBlock.style.display = "none";
  }

  // Sync combo tag in the timer bar
  renderComboTag();
}

/**
 * Update the arcade combo tag text and visual tier.
 * Tier drives CSS color overrides: 1=default, 2=yellow, 3=orange, 4=red
 */
function renderComboTag() {
  const tagText = document.getElementById("combo-tag-text");
  if (!tagText) return;

  const m = state.multiplier;
  tagText.textContent = `COMBO : ×${m.toFixed(1)}`;

  // Map multiplier to tier for color styling
  const tier = m >= 4 ? "4" : m >= 3 ? "3" : m >= 2 ? "2" : "1";
  tagText.dataset.tier = tier;
}

/**
 * Trigger the combo bump animation on the tag text.
 */
function animateComboTag() {
  const tagText = document.getElementById("combo-tag-text");
  if (!tagText) return;
  tagText.classList.remove("combo-bump");
  void tagText.offsetWidth; // reflow to restart
  tagText.classList.add("combo-bump");
}

/** Update the progress bar width */
function renderProgress() {
  const pct = (state.currentIndex / state.questions.length) * 100;
  document.getElementById("progress").style.width = pct + "%";
}

/**
 * Render the timer bar fill.
 * @param {number} timeLeft  — seconds remaining
 * @param {number} totalTime — initial time for this question
 */
function renderTimer(timeLeft, totalTime) {
  const fillEl = document.getElementById("timer-fill");
  const pct    = (timeLeft / totalTime) * 100;
  fillEl.style.width = pct + "%";
  fillEl.classList.toggle("urgent", timeLeft <= 5);
}

/**
 * Render the digital stopwatch display (seconds + centiseconds).
 * @param {number} timeLeft   — full seconds remaining
 * @param {number} timeLeftMs — centiseconds (0–99)
 */
function renderStopwatch(timeLeft, timeLeftMs) {
  const el = document.getElementById("stopwatch-val");
  if (!el) return;
  const cs = String(timeLeftMs).padStart(2, "0");
  el.innerHTML = `${timeLeft}<span class="stopwatch-ms">.${cs}</span>`;
}

/**
 * Show the +BONUS floating text animation.
 */
function showBonusFloat(text) {
  const el = document.getElementById("bonus-float");
  el.textContent = text;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

/** Render the personal best on the start screen */
function renderPersonalBest() {
  const best = localStorage.getItem("quizBest");
  const el   = document.getElementById("pb-score");
  el.textContent = best ? best : "—";
}


/* ─────────────────────────────────────────────
   9. THEME TOGGLE — Noir / Light Mode
   ───────────────────────────────────────────── */

/**
 * Toggle Noir (dark) mode on/off.
 * Flips body.noir class and updates toggle button label.
 */
function toggleNoir() {
  state.noirMode = !state.noirMode;
  document.body.classList.toggle("noir", state.noirMode);

  const label = document.getElementById("theme-label");
  if (label) {
    label.textContent = state.noirMode ? "LIGHT" : "NOIR";
  }

  // Persist preference
  try {
    localStorage.setItem("quizNoirMode", state.noirMode ? "1" : "0");
  } catch (_) {}
}

/** Restore saved Noir preference on page load */
function initTheme() {
  try {
    const saved = localStorage.getItem("quizNoirMode");
    if (saved === "1") {
      state.noirMode = true;
      document.body.classList.add("noir");
      const label = document.getElementById("theme-label");
      if (label) label.textContent = "LIGHT";
    }
  } catch (_) {}
}


/* ─────────────────────────────────────────────
   10. FLOATING CONTROLS — Sound + Blind Mode
   ───────────────────────────────────────────── */

/**
 * Sync the visual state of both floating control buttons
 * based on state.soundEnabled and state.blindMode.
 */
function syncFloatControls() {
  // ── Sound ctrl ──
  const soundBtn  = document.getElementById("sound-ctrl");
  const soundWaves = soundBtn.querySelector(".sound-waves");
  const muteX      = soundBtn.querySelector(".mute-x");

  soundBtn.dataset.active = state.soundEnabled ? "true" : "false";
  if (soundWaves) soundWaves.style.display = state.soundEnabled ? "" : "none";
  if (muteX)      muteX.style.display      = state.soundEnabled ? "none" : "";

  // ── Blind ctrl ──
  const blindBtn  = document.getElementById("blind-ctrl");
  const eyeOpen   = blindBtn.querySelector(".eye-open");
  const blindSlash = blindBtn.querySelector(".blind-slash");

  blindBtn.dataset.active = state.blindMode ? "true" : "false";
  if (eyeOpen)    eyeOpen.style.display    = state.blindMode ? "none" : "";
  if (blindSlash) blindSlash.style.display = state.blindMode ? "" : "none";
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  syncFloatControls();
  // Quick click sound to confirm (only if just enabled)
  if (state.soundEnabled) playTone(440, 0.1, "sine", 0.15);
}

function toggleBlind() {
  state.blindMode = !state.blindMode;
  syncFloatControls();
}


/* ─────────────────────────────────────────────
   7. GAME LOGIC
   ───────────────────────────────────────────── */

const TIMER_DURATION = 15; // seconds per question
const STOPWATCH_TICK = 50; // ms interval for stopwatch update

/** Called when Start button is pressed */
function startQuiz() {
  const config = readConfig();

  // Apply config to state
  setState("timerEnabled",  config.timerEnabled);
  setState("blindMode",     config.blindMode);
  setState("soundEnabled",  config.soundEnabled);

  // Reset all game state
  setState("currentIndex",    0);
  setState("score",           0);
  setState("streak",          0);
  setState("maxStreak",       0);
  setState("multiplier",      1);
  setState("maxMultiplier",   1);
  setState("answersDisabled", false);
  setState("timerInterval",   null);
  setState("stopwatchInterval", null);
  setState("timeLeft",        TIMER_DURATION);
  setState("timeLeftMs",      0);
  setState("totalTimeLeft",   0);
  setState("lifelineUsed",    false);
  setState("lifelineHalved",  false);
  setState("history",         []);

  // Build the question set from the chosen category
  const pool = config.category === "all"
    ? allQuestions
    : questionBank[config.category] ?? allQuestions;

  setState("questions", buildQuiz(pool, config.difficulty, 10));

  // Update static HUD values
  document.getElementById("total-questions").textContent = state.questions.length;

  // Show / hide timer/combo bar based on config
  document.getElementById("timer-bar-wrap").classList.toggle("hidden", !state.timerEnabled);

  // Reset lifeline button
  const lifelineBtn = document.getElementById("lifeline-btn");
  lifelineBtn.disabled = false;
  lifelineBtn.classList.remove("halved");

  sfx.start();
  showScreen("quiz-screen");
  showQuestion();
}

/** Display the current question and its answer buttons */
function showQuestion() {
  setState("answersDisabled", false);
  setState("lifelineHalved",  false);
  clearTimer();

  const q = state.questions[state.currentIndex];

  renderHUD();       // also calls renderComboTag() internally
  renderProgress();

  // Difficulty tag
  const tag = document.getElementById("question-difficulty-tag");
  tag.textContent = q.difficulty.toUpperCase();
  tag.className   = `question-difficulty-tag ${q.difficulty}`;

  // Question text
  document.getElementById("question-text").textContent = q.question;

  // Build answer buttons
  const container = document.getElementById("answers-container");
  container.innerHTML = "";
  const keys = ["1", "2", "3", "4"];

  q.answers.forEach((answer, idx) => {
    const btn             = document.createElement("button");
    btn.className         = "answer-btn";
    btn.dataset.correct   = answer.correct;
    btn.dataset.index     = idx;
    btn.disabled          = false;

    const keySpan         = document.createElement("span");
    keySpan.className     = "answer-key";
    keySpan.textContent   = keys[idx];

    const textSpan        = document.createElement("span");
    textSpan.textContent  = answer.text;

    btn.appendChild(keySpan);
    btn.appendChild(textSpan);
    container.appendChild(btn);
  });

  // Reset lifeline button's halved visual for this question
  const lifelineBtn = document.getElementById("lifeline-btn");
  lifelineBtn.classList.remove("halved");

  // Start timer if enabled
  if (state.timerEnabled) {
    setState("timeLeft",   TIMER_DURATION);
    setState("timeLeftMs", 99);
    renderTimer(TIMER_DURATION, TIMER_DURATION);
    renderStopwatch(TIMER_DURATION, 99);
    startTimer();
  }
}

/** Start the countdown timer (1s ticks) and stopwatch (50ms ticks) */
function startTimer() {
  // 1-second tick for the fill bar
  const interval = setInterval(() => {
    const newTime = state.timeLeft - 1;
    setState("timeLeft", newTime);
    renderTimer(newTime, TIMER_DURATION);

    if (newTime <= 0) {
      clearInterval(interval);
      setState("timerInterval", null);
      handleTimeout();
    }
  }, 1000);
  setState("timerInterval", interval);

  // 50ms tick for the digital stopwatch (centiseconds)
  setState("timeLeftMs", 99);
  const swInterval = setInterval(() => {
    if (state.answersDisabled) return;
    let ms = state.timeLeftMs - Math.round(STOPWATCH_TICK / 10);
    if (ms < 0) ms = 99; // rolls over with the second tick
    setState("timeLeftMs", ms);
    renderStopwatch(state.timeLeft, ms);
  }, STOPWATCH_TICK);
  setState("stopwatchInterval", swInterval);
}

/** Clear the running timer + stopwatch safely */
function clearTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    setState("timerInterval", null);
  }
  if (state.stopwatchInterval) {
    clearInterval(state.stopwatchInterval);
    setState("stopwatchInterval", null);
  }
}

/** Called when timer hits 0 — auto-submit as wrong */
function handleTimeout() {
  sfx.timeout();
  setState("answersDisabled", true);

  const q = state.questions[state.currentIndex];
  state.history.push({
    question:     q.question,
    selectedText: null,
    correctText:  q.answers.find(a => a.correct).text,
    wasCorrect:   false,
    timedOut:     true,
  });

  // Break streak
  setState("streak",     0);
  setState("multiplier", 1);
  renderHUD();

  // Reveal correct answer
  const buttons = document.querySelectorAll(".answer-btn");
  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.correct === "true") btn.classList.add("correct");
  });

  setTimeout(advanceQuestion, 1200);
}

/** Event handler for answer button clicks (event delegation) */
function handleAnswerClick(e) {
  const btn = e.target.closest(".answer-btn");
  if (!btn || state.answersDisabled) return;

  clearTimer();
  setState("answersDisabled", true);

  const isCorrect = btn.dataset.correct === "true";
  const q         = state.questions[state.currentIndex];

  // Record history entry
  state.history.push({
    question:     q.question,
    selectedText: btn.querySelector("span:last-child").textContent,
    correctText:  q.answers.find(a => a.correct).text,
    wasCorrect:   isCorrect,
    timedOut:     false,
  });

  // Reveal correct/wrong visuals (skip in blind mode)
  const allBtns = document.querySelectorAll(".answer-btn");
  allBtns.forEach(b => {
    b.disabled = true;
    if (!state.blindMode) {
      if (b.dataset.correct === "true") b.classList.add("correct");
      else if (b === btn && !isCorrect) b.classList.add("incorrect");
    }
  });

  if (isCorrect) {
    const newStreak     = state.streak + 1;
    const newMultiplier = streakToMultiplier(newStreak);
    setState("streak",     newStreak);
    setState("multiplier", newMultiplier);
    if (newStreak     > state.maxStreak)      setState("maxStreak",      newStreak);
    if (newMultiplier > state.maxMultiplier)  setState("maxMultiplier",  newMultiplier);

    // Points (halved if lifeline was used this question)
    const points   = calcPoints(state.timeLeft, newMultiplier);
    setState("score", state.score + points);
    setState("totalTimeLeft", state.totalTimeLeft + state.timeLeft);

    // Trigger combo tag bump animation when multiplier level increases
    if (newMultiplier > 1) animateComboTag();

    // Feedback sounds
    if (newMultiplier > state.multiplier || newStreak === 3) sfx.combo();
    else sfx.correct();

    // Show bonus float
    let bonusText = newMultiplier > 1 ? `+${points} ×${newMultiplier}` : `+${points}`;
    if (state.lifelineHalved) bonusText += " ½";
    showBonusFloat(bonusText);

  } else {
    setState("streak",     0);
    setState("multiplier", 1);
    renderComboTag(); // reset combo tag display
    sfx.wrong();
  }

  renderHUD();
  setTimeout(advanceQuestion, 1100);
}

/** Move to next question or results */
function advanceQuestion() {
  const nextIndex = state.currentIndex + 1;
  setState("currentIndex", nextIndex);
  if (nextIndex < state.questions.length) {
    showQuestion();
  } else {
    showResults();
  }
}

/**
 * Activate the 50/50 lifeline.
 * Eliminates 2 wrong answers AND halves the max points for this question.
 */
function useLifeline() {
  if (state.lifelineUsed || state.answersDisabled) return;
  setState("lifelineUsed",   true);
  setState("lifelineHalved", true); // points cost flag

  const lifelineBtn = document.getElementById("lifeline-btn");
  lifelineBtn.disabled = true;
  lifelineBtn.classList.add("halved"); // visual slashed-coin cue

  // Get all wrong-answer buttons and eliminate 2
  const wrongBtns = Array.from(
    document.querySelectorAll(".answer-btn")
  ).filter(btn => btn.dataset.correct === "false");

  shuffle(wrongBtns).slice(0, 2).forEach(btn => {
    btn.classList.add("eliminated");
    btn.disabled = true;
  });

  sfx.lifeline();
}

/** Display the results screen */
function showResults() {
  clearTimer();

  // Personal best check (score-based, not /10)
  const prevBest = parseInt(localStorage.getItem("quizBest") || "0");
  if (state.score > prevBest) {
    localStorage.setItem("quizBest", state.score);
    document.getElementById("new-best-badge").style.display = "inline-block";
    sfx.newBest();
  } else {
    document.getElementById("new-best-badge").style.display = "none";
    sfx.start();
  }

  renderPersonalBest();

  // Raw score — no /10 denominator
  document.getElementById("final-score").textContent = state.score;
  // max-score is hidden but kept for JS compatibility
  document.getElementById("max-score").textContent   = state.questions.length;

  document.getElementById("result-streak").textContent    = state.maxStreak;
  document.getElementById("result-max-combo").textContent = `×${state.maxMultiplier}`;
  document.getElementById("result-time").textContent      = state.timerEnabled
    ? `${state.totalTimeLeft}s`
    : "—";

  // Result message based on correct percentage
  const correctCount = state.history.filter(h => h.wasCorrect).length;
  const pct          = (correctCount / state.questions.length) * 100;
  let msg;
  if (pct === 100)     msg = "PERFECT! GENIUS!";
  else if (pct >= 80)  msg = "GREAT WORK!";
  else if (pct >= 60)  msg = "GOOD EFFORT!";
  else if (pct >= 40)  msg = "NOT BAD!";
  else                 msg = "KEEP GRINDING!";
  document.getElementById("result-message").textContent = msg;

  showScreen("result-screen");
}

/** Build and display the answer review screen */
function showReviewScreen() {
  const list = document.getElementById("review-list");
  list.innerHTML = "";

  state.history.forEach((entry, i) => {
    const item = document.createElement("div");
    item.className = `review-item ${entry.wasCorrect ? "was-correct" : "was-wrong"}`;

    const qEl = document.createElement("div");
    qEl.className   = "review-q";
    qEl.textContent = `Q${i + 1}: ${entry.question}`;

    const ansRow = document.createElement("div");
    ansRow.className = "review-answer-row";

    if (entry.timedOut) {
      ansRow.innerHTML = `
        <span class="review-label">YOUR ANSWER:</span>
        <span class="review-timeout">TIMED OUT</span>
        <span class="review-label" style="margin-left:8px">CORRECT:</span>
        <span class="review-correct-ans">${entry.correctText}</span>
      `;
    } else if (entry.wasCorrect) {
      ansRow.innerHTML = `
        <span class="review-label">YOUR ANSWER:</span>
        <span class="review-your-ans correct">${entry.selectedText} ✓</span>
      `;
    } else {
      ansRow.innerHTML = `
        <span class="review-label">YOUR ANSWER:</span>
        <span class="review-your-ans wrong">${entry.selectedText} ✗</span>
        <span class="review-label" style="margin-left:8px">CORRECT:</span>
        <span class="review-correct-ans">${entry.correctText}</span>
      `;
    }

    item.appendChild(qEl);
    item.appendChild(ansRow);
    list.appendChild(item);
  });

  showScreen("review-screen");
}

/** Restart — go back to start screen */
function restartQuiz() {
  clearTimer();
  renderPersonalBest();
  showScreen("start-screen");
}


/* ─────────────────────────────────────────────
   8. KEYBOARD NAVIGATION
   ───────────────────────────────────────────── */

document.addEventListener("keydown", (e) => {
  if (!document.getElementById("quiz-screen").classList.contains("active")) return;
  if (state.answersDisabled) return;
  const keyMap = { "1": 0, "2": 1, "3": 2, "4": 3 };
  const idx    = keyMap[e.key];
  if (idx !== undefined) {
    const btns = document.querySelectorAll(".answer-btn:not(:disabled)");
    if (btns[idx]) btns[idx].click();
  }
});


/* ─────────────────────────────────────────────
   11. EVENT WIRING
   ───────────────────────────────────────────── */

// Theme toggle
document.getElementById("theme-toggle").addEventListener("click", toggleNoir);

// Floating icon controls
document.getElementById("sound-ctrl").addEventListener("click", toggleSound);
document.getElementById("blind-ctrl").addEventListener("click", toggleBlind);

// Start button
document.getElementById("start-btn").addEventListener("click", startQuiz);

// Answer selection — event delegation
document.getElementById("answers-container").addEventListener("click", handleAnswerClick);

// Lifeline
document.getElementById("lifeline-btn").addEventListener("click", useLifeline);

// Result screen actions
document.getElementById("review-btn").addEventListener("click", showReviewScreen);
document.getElementById("restart-btn").addEventListener("click", restartQuiz);

// Review → back to results
document.getElementById("back-to-result-btn").addEventListener("click", () => showScreen("result-screen"));


/* ─────────────────────────────────────────────
   INIT — run on page load
   ───────────────────────────────────────────── */

initTheme();
syncFloatControls();
renderPersonalBest();
