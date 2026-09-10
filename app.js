import { QUESTIONS, CATEGORIES } from "./questions.js";

// ---------- Config ----------
const ROUND_SIZE = 5; // nombre de questions consécutives par joueur avant de tourner
const BONUS_RATIO = 6; // environ 1 question sur 6 est bonus (x2 points)

const WELCOME_PHRASES = [
  "Que le meilleur des Bibouns gagne !",
  "Que la culture G soit avec vous !",
  "Prêts à briller ou à rougir ?",
  "L'apéro attend, la partie commence !",
  "Que les neurones chauffent !",
  "Un peu de sérieux... juste un peu !",
  "Le savoir, ça se fête !",
  "Que le meilleur bluffeur perde !",
  "Allez, on sort le cerveau du frigo !",
  "Ici, on ne triche que sur les glaçons !",
  "Que la mémoire soit avec vous !",
  "Le trophée de Biboun de l'année se joue maintenant !",
  "Respirez, ça va piquer un peu !",
];

// ---------- Utils ----------
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function $(sel, root = document) {
  return root.querySelector(sel);
}
function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

// ---------- State ----------
const PLAYERS_KEY = "apero-bibouns-players";
const USED_KEY = "apero-bibouns-used-questions";

const state = {
  players: [], // [{ name, score }]
  questionCount: 20,
  gameQuestions: [], // [{ cat, q, a, bonus }]
  currentQuestionIndex: 0,
  answered: false,
};

function currentPlayerIndex() {
  if (state.players.length === 0) return 0;
  return Math.floor(state.currentQuestionIndex / ROUND_SIZE) % state.players.length;
}

function loadSavedPlayers() {
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    if (!raw) return [];
    const names = JSON.parse(raw);
    if (Array.isArray(names)) return names;
  } catch (e) {
    /* ignore */
  }
  return [];
}

function savePlayerNames() {
  try {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(state.players.map((p) => p.name)));
  } catch (e) {
    /* ignore */
  }
}

// ---------- Anti-repetition across sessions ----------
function loadUsedQuestions() {
  try {
    const raw = localStorage.getItem(USED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr);
  } catch (e) {
    /* ignore */
  }
  return new Set();
}

function saveUsedQuestions(set) {
  try {
    localStorage.setItem(USED_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    /* ignore */
  }
}

function assignBonusQuestions(questions) {
  if (questions.length === 0) return questions;
  const bonusCount = Math.max(1, Math.round(questions.length / BONUS_RATIO));
  const bonusIndices = new Set(shuffle(questions.map((_, i) => i)).slice(0, bonusCount));
  return questions.map((q, i) => ({ ...q, bonus: bonusIndices.has(i) }));
}

function buildGamePool(count) {
  const used = loadUsedQuestions();
  let fresh = QUESTIONS.filter((q) => !used.has(q.q));

  // Pas assez de questions inédites restantes : on repart sur tout le stock
  if (fresh.length < count) {
    used.clear();
    fresh = QUESTIONS.slice();
  }

  const picked = shuffle(fresh).slice(0, Math.min(count, fresh.length));
  picked.forEach((q) => used.add(q.q));
  saveUsedQuestions(used);
  return assignBonusQuestions(picked);
}

// ---------- Screens ----------
const screens = {
  setup: $("#screen-setup"),
  game: $("#screen-game"),
  end: $("#screen-end"),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
}

// ---------- Setup screen ----------
const playerInput = $("#player-name-input");
const addPlayerBtn = $("#add-player-btn");
const playerListEl = $("#player-list");
const countButtons = $all(".count-btn");
const startBtn = $("#start-game-btn");

function renderPlayerList() {
  playerListEl.innerHTML = "";
  state.players.forEach((p, idx) => {
    const chip = document.createElement("li");
    chip.className = "player-chip";
    chip.innerHTML = `<span>${escapeHtml(p.name)}</span><button aria-label="Retirer ${escapeHtml(p.name)}">×</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      state.players.splice(idx, 1);
      renderPlayerList();
      updateStartButton();
    });
    playerListEl.appendChild(chip);
  });
  updateStartButton();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function addPlayer() {
  const name = playerInput.value.trim();
  if (!name) return;
  if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    playerInput.value = "";
    return;
  }
  state.players.push({ name, score: 0 });
  playerInput.value = "";
  playerInput.focus();
  renderPlayerList();
  savePlayerNames();
}

addPlayerBtn.addEventListener("click", addPlayer);
playerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addPlayer();
  }
});

countButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    countButtons.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.questionCount = parseInt(btn.dataset.count, 10);
  });
});

function updateStartButton() {
  startBtn.disabled = state.players.length < 1;
}

startBtn.addEventListener("click", startGame);

// ---------- Game screen ----------
const turnBannerEl = $("#turn-banner");
const turnPlayerEl = $("#turn-player");
const roundDotsEl = $("#round-dots");
const progressEl = $("#progress");
const categoryBadgeEl = $("#category-badge");
const bonusBadgeEl = $("#bonus-badge");
const questionTextEl = $("#question-text");
const answerTextEl = $("#answer-text");
const answerBox = $("#answer-box");
const revealBtn = $("#reveal-btn");
const judgeButtons = $("#judge-buttons");
const correctBtn = $("#correct-btn");
const wrongBtn = $("#wrong-btn");
const miniScoreEl = $("#mini-scores");
const stealPanel = $("#steal-panel");
const stealButtonsEl = $("#steal-buttons");
const stealNoneBtn = $("#steal-none-btn");

function startGame() {
  // reset scores for a fresh game, keep names
  state.players.forEach((p) => (p.score = 0));
  state.currentQuestionIndex = 0;
  state.answered = false;
  state.gameQuestions = buildGamePool(state.questionCount);

  showScreen("game");
  renderQuestion({ announcePlayer: true, isGameStart: true });
}

function renderMiniScores() {
  const activeIdx = currentPlayerIndex();
  miniScoreEl.innerHTML = state.players
    .map((p, i) => `<span class="mini-score${i === activeIdx ? " active" : ""}">${escapeHtml(p.name)}: ${p.score}</span>`)
    .join("");
}

function renderRoundDots() {
  const posInRound = state.currentQuestionIndex % ROUND_SIZE;
  let dots = "";
  for (let i = 0; i < ROUND_SIZE; i++) {
    dots += `<span class="dot${i < posInRound ? " done" : ""}${i === posInRound ? " current" : ""}"></span>`;
  }
  roundDotsEl.innerHTML = dots;
}

function renderQuestion({ announcePlayer = false, isGameStart = false } = {}) {
  const q = state.gameQuestions[state.currentQuestionIndex];
  const player = state.players[currentPlayerIndex()];
  const cat = CATEGORIES[q.cat] || { label: q.cat, emoji: "❓" };

  turnPlayerEl.textContent = `🎤 ${player.name}`;
  progressEl.textContent = `Question ${state.currentQuestionIndex + 1} / ${state.gameQuestions.length}`;
  categoryBadgeEl.textContent = `${cat.emoji} ${cat.label}`;
  bonusBadgeEl.classList.toggle("hidden", !q.bonus);
  questionTextEl.textContent = q.q;
  answerTextEl.textContent = q.a;
  answerBox.classList.add("hidden");
  revealBtn.classList.remove("hidden");
  judgeButtons.classList.add("hidden");
  stealPanel.classList.add("hidden");
  state.answered = false;
  renderRoundDots();
  renderMiniScores();

  if (announcePlayer) {
    const phrase = isGameStart ? pickRandom(WELCOME_PHRASES) : null;
    flashPlayerBanner(player.name, phrase);
  }
}

function flashPlayerBanner(name, welcomePhrase) {
  turnBannerEl.innerHTML = welcomePhrase
    ? `🎉 ${escapeHtml(welcomePhrase)}<br>🎤 Au tour de ${escapeHtml(name)} !`
    : `🔄 Au tour de ${escapeHtml(name)} !`;
  turnBannerEl.classList.remove("show");
  // force reflow so the animation can replay
  void turnBannerEl.offsetWidth;
  turnBannerEl.classList.add("show");
}

revealBtn.addEventListener("click", () => {
  answerBox.classList.remove("hidden");
  revealBtn.classList.add("hidden");
  judgeButtons.classList.remove("hidden");
});

function pointsForCurrentQuestion() {
  const q = state.gameQuestions[state.currentQuestionIndex];
  return q.bonus ? 2 : 1;
}

function judge(isCorrect) {
  if (state.answered) return;
  state.answered = true;

  if (isCorrect) {
    state.players[currentPlayerIndex()].score += pointsForCurrentQuestion();
    nextTurn();
  } else {
    offerSteal();
  }
}

correctBtn.addEventListener("click", () => judge(true));
wrongBtn.addEventListener("click", () => judge(false));

function offerSteal() {
  judgeButtons.classList.add("hidden");

  if (state.players.length < 2) {
    nextTurn();
    return;
  }

  const activeIdx = currentPlayerIndex();
  stealButtonsEl.innerHTML = "";
  state.players.forEach((p, i) => {
    if (i === activeIdx) return;
    const btn = document.createElement("button");
    btn.textContent = escapeHtml(p.name);
    btn.addEventListener("click", () => {
      p.score += pointsForCurrentQuestion();
      stealPanel.classList.add("hidden");
      nextTurn();
    });
    stealButtonsEl.appendChild(btn);
  });
  stealPanel.classList.remove("hidden");
}

stealNoneBtn.addEventListener("click", () => {
  stealPanel.classList.add("hidden");
  nextTurn();
});

function nextTurn() {
  const previousPlayerIdx = currentPlayerIndex();
  state.currentQuestionIndex += 1;

  if (state.currentQuestionIndex >= state.gameQuestions.length) {
    endGame();
    return;
  }

  const newPlayerIdx = currentPlayerIndex();
  renderQuestion({ announcePlayer: newPlayerIdx !== previousPlayerIdx });
}

// ---------- End screen ----------
const finalScoresEl = $("#final-scores");
const replayBtn = $("#replay-btn");
const newGameBtn = $("#new-game-btn");

function endGame() {
  const sorted = state.players.slice().sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉"];
  finalScoresEl.innerHTML = sorted
    .map((p, i) => `<li class="final-row">${medals[i] || "🎉"} <span>${escapeHtml(p.name)}</span> <strong>${p.score}</strong></li>`)
    .join("");
  showScreen("end");
}

replayBtn.addEventListener("click", () => {
  showScreen("setup");
});

newGameBtn.addEventListener("click", () => {
  state.players = [];
  renderPlayerList();
  showScreen("setup");
});

// ---------- Init ----------
function init() {
  const savedNames = loadSavedPlayers();
  state.players = savedNames.map((name) => ({ name, score: 0 }));
  renderPlayerList();
  showScreen("setup");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
