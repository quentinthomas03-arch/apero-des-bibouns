import { QUESTIONS, CATEGORIES } from "./questions.js";

// ---------- Utils ----------
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function $(sel, root = document) {
  return root.querySelector(sel);
}
function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

// ---------- State ----------
const STORAGE_KEY = "apero-bibouns-players";

const state = {
  players: [], // [{ name, score }]
  currentPlayerIndex: 0,
  questionCount: 20,
  gameQuestions: [],
  currentQuestionIndex: 0,
  answered: false,
};

function loadSavedPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.players.map((p) => p.name)));
  } catch (e) {
    /* ignore */
  }
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
const turnPlayerEl = $("#turn-player");
const progressEl = $("#progress");
const categoryBadgeEl = $("#category-badge");
const questionTextEl = $("#question-text");
const answerTextEl = $("#answer-text");
const answerBox = $("#answer-box");
const revealBtn = $("#reveal-btn");
const judgeButtons = $("#judge-buttons");
const correctBtn = $("#correct-btn");
const wrongBtn = $("#wrong-btn");
const miniScoreEl = $("#mini-scores");

function startGame() {
  // reset scores for a fresh game, keep names
  state.players.forEach((p) => (p.score = 0));
  state.currentPlayerIndex = 0;
  state.currentQuestionIndex = 0;
  state.answered = false;

  const pool = shuffle(QUESTIONS);
  state.gameQuestions = pool.slice(0, Math.min(state.questionCount, pool.length));

  showScreen("game");
  renderQuestion();
}

function renderMiniScores() {
  miniScoreEl.innerHTML = state.players
    .map((p, i) => `<span class="mini-score${i === state.currentPlayerIndex ? " active" : ""}">${escapeHtml(p.name)}: ${p.score}</span>`)
    .join("");
}

function renderQuestion() {
  const q = state.gameQuestions[state.currentQuestionIndex];
  const player = state.players[state.currentPlayerIndex];
  const cat = CATEGORIES[q.cat] || { label: q.cat, emoji: "❓" };

  turnPlayerEl.textContent = `🎤 Au tour de : ${player.name}`;
  progressEl.textContent = `Question ${state.currentQuestionIndex + 1} / ${state.gameQuestions.length}`;
  categoryBadgeEl.textContent = `${cat.emoji} ${cat.label}`;
  questionTextEl.textContent = q.q;
  answerTextEl.textContent = q.a;
  answerBox.classList.add("hidden");
  revealBtn.classList.remove("hidden");
  judgeButtons.classList.add("hidden");
  state.answered = false;
  renderMiniScores();
}

revealBtn.addEventListener("click", () => {
  answerBox.classList.remove("hidden");
  revealBtn.classList.add("hidden");
  judgeButtons.classList.remove("hidden");
});

function judge(isCorrect) {
  if (state.answered) return;
  state.answered = true;
  if (isCorrect) {
    state.players[state.currentPlayerIndex].score += 1;
  }
  nextTurn();
}

correctBtn.addEventListener("click", () => judge(true));
wrongBtn.addEventListener("click", () => judge(false));

function nextTurn() {
  state.currentQuestionIndex += 1;
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;

  if (state.currentQuestionIndex >= state.gameQuestions.length) {
    endGame();
    return;
  }
  renderQuestion();
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
