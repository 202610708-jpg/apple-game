// --- 설정 및 상태 변수 ---
const COLS = 17;
const ROWS = 10;
const GAME_TIME = 150; // 150초 (2분 30초)
const PENALTY_TIME = 10; // 틀렸을 때 차감할 시간 (10초)
const BASE_SCORE_PER_APPLE = 10;
const COMBO_TIMEOUT = 2000; // 콤보 유지 시간 (2초)

let boardData = [];
let isDragging = false;
let startCell = null;
let currentCell = null;
let score = 0;
let timeLeft = GAME_TIME;
let timerId = null;
let comboCount = 0;
let comboTimerId = null;

// --- 사운드 효과 (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  if (type === 'pop') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600 + (comboCount * 100), now);
    osc.frequency.exponentialRampToValueAtTime(800 + (comboCount * 100), now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'fail') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// --- DOM 요소 참조 ---
const boardEl = document.getElementById('board');
const boardContainer = document.getElementById('boardContainer');
const selectionOverlay = document.getElementById('selectionOverlay');
const sumIndicator = document.getElementById('sumIndicator');
const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const comboBadge = document.getElementById('comboBadge');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalStats = document.getElementById('finalStats');

// --- 보드 생성 및 초기화 (같은 숫자는 인접 영역에서 최대 2개까지만 허용) ---
function initBoard() {
  boardEl.innerHTML = '';
  boardData = [];
  
  // 전체 셀 수(170개)를 채우되, 각 숫자(1~9)가 짝을 이루도록 배치
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      let val;
      let valid = false;

      // 같은 숫자가 인접(위, 왼쪽)에 3개 이상 연속되지 않도록 검증
      while (!valid) {
        val = Math.floor(Math.random() * 9) + 1; // 1~9 사이 숫자
        
        const left1 = c > 0 ? row[c - 1]?.val : null;
        const left2 = c > 1 ? row[c - 2]?.val : null;
        const top1 = r > 0 ? boardData[r - 1][c]?.val : null;
        const top2 = r > 1 ? boardData[r - 2][c]?.val : null;

        // 가로/세로로 3연속 동일 숫자가 나오지 않도록 방지 (최대 2개까지만 허용)
        if ((val === left1 && val === left2) || (val === top1 && val === top2)) {
          continue;
        }
        valid = true;
      }

      const appleEl = document.createElement('div');
      appleEl.className = 'apple';
      appleEl.textContent = val;
      appleEl.dataset.row = r;
      appleEl.dataset.col = c;
      boardEl.appendChild(appleEl);
      row.push({ val, removed: false, el: appleEl });
    }
    boardData.push(row);
  }
}

// --- 드래그 위치 계산 및 영역 UI 업데이트 ---
function getCellIndicesFromPoint(x, y) {
  const rect = boardEl.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  
  const col = Math.floor((x - rect.left) / (rect.width / COLS));
  const row = Math.floor((y - rect.top) / (rect.height / ROWS));
  
  if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
    return { row, col };
  }
  return null;
}

function getSelectedBounds() {
  if (!startCell || !currentCell) return null;
  return {
    minRow: Math.min(startCell.row, currentCell.row),
    maxRow: Math.max(startCell.row, currentCell.row),
    minCol: Math.min(startCell.col, currentCell.col),
    maxCol: Math.max(startCell.col, currentCell.col)
  };
}

function updateSelectionUI() {
  const bounds = getSelectedBounds();
  if (!bounds) return;

  let currentSum = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const apple = boardData[r][c];
      const isSelected = !apple.removed && 
        r >= bounds.minRow && r <= bounds.maxRow && 
        c >= bounds.minCol && c <= bounds.maxCol;

      if (isSelected) {
        apple.el.classList.add('selected');
        currentSum += apple.val;
      } else {
        apple.el.classList.remove('selected');
      }
    }
  }

  const startEl = boardData[bounds.minRow][bounds.minCol].el;
  const endEl = boardData[bounds.maxRow][bounds.maxCol].el;
  const boardRect = boardContainer.getBoundingClientRect();
  const startRect = startEl.getBoundingClientRect();
  const endRect = endEl.getBoundingClientRect();

  const top = startRect.top - boardRect.top;
  const left = startRect.left - boardRect.left;
  const width = endRect.right - startRect.left;
  const height = endRect.bottom - startRect.top;

  selectionOverlay.style.top = `${top}px`;
  selectionOverlay.style.left = `${left}px`;
  selectionOverlay.style.width = `${width}px`;
  selectionOverlay.style.height = `${height}px`;
  selectionOverlay.style.display = 'block';

  if (currentSum === 10) {
    selectionOverlay.classList.add('valid');
  } else {
    selectionOverlay.classList.remove('valid');
  }

  sumIndicator.textContent = currentSum;
  sumIndicator.style.top = `${top}px`;
  sumIndicator.style.left = `${left + width / 2}px`;
  sumIndicator.style.display = 'block';
}

function clearSelection() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      boardData[r][c].el.classList.remove('selected');
    }
  }
  selectionOverlay.style.display = 'none';
  sumIndicator.style.display = 'none';
}

// --- 드래그 이벤트 핸들러 ---
function handleDragStart(e) {
  if (timeLeft <= 0) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const cell = getCellIndicesFromPoint(clientX, clientY);

  if (cell) {
    isDragging = true;
    startCell = cell;
    currentCell = cell;
    updateSelectionUI();
  }
}

function handleDragMove(e) {
  if (!isDragging) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const cell = getCellIndicesFromPoint(clientX, clientY);

  if (cell) {
    currentCell = cell;
    updateSelectionUI();
  }
}

function handleDragEnd() {
  if (!isDragging) return;
  isDragging = false;

  const bounds = getSelectedBounds();
  if (bounds) {
    let currentSum = 0;
    const selectedApples = [];

    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        const apple = boardData[r][c];
        if (!apple.removed) {
          currentSum += apple.val;
          selectedApples.push(apple);
        }
      }
    }

    if (currentSum === 10 && selectedApples.length > 0) {
      selectedApples.forEach(apple => {
        apple.removed = true;
        apple.el.classList.add('removed');
      });

      triggerCombo();
      const gainedScore = (selectedApples.length * BASE_SCORE_PER_APPLE) * (1 + (comboCount - 1) * 0.2);
      score += Math.round(gainedScore);
      scoreEl.textContent = score;

      playSound('pop');
    } else if (selectedApples.length > 0) {
      playSound('fail');
      applyTimePenalty();
    }
  }

  clearSelection();
  startCell = null;
  currentCell = null;
}

// --- 시간 차감 패널티 ---
function applyTimePenalty() {
  timeLeft = Math.max(0, timeLeft - PENALTY_TIME);
  timerEl.textContent = timeLeft;

  timerEl.style.color = '#ff4d4d';
  timerEl.style.transform = 'scale(1.2)';
  timerEl.style.transition = 'all 0.1s ease';

  setTimeout(() => {
    timerEl.style.color = '';
    timerEl.style.transform = '';
  }, 300);

  if (timeLeft <= 0) {
    endGame();
  }
}

// --- 콤보 처리 ---
function triggerCombo() {
  comboCount++;
  comboBadge.textContent = `${comboCount} COMBO!`;
  comboBadge.classList.add('active');

  clearTimeout(comboTimerId);
  comboTimerId = setTimeout(() => {
    comboCount = 0;
    comboBadge.classList.remove('active');
  }, COMBO_TIMEOUT);
}

// --- 게임 타이머 및 라이프사이클 ---
function startGame() {
  score = 0;
  timeLeft = GAME_TIME;
  comboCount = 0;
  scoreEl.textContent = '0';
  timerEl.textContent = GAME_TIME;
  
  startScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';

  initBoard();

  clearInterval(timerId);
  timerId = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  clearInterval(timerId);
  clearTimeout(comboTimerId);
  finalStats.innerHTML = `최종 점수: <strong>${score}점</strong>`;
  gameOverScreen.style.display = 'flex';
}

// --- 이벤트 리스너 등록 ---
boardContainer.addEventListener('mousedown', handleDragStart);
window.addEventListener('mousemove', handleDragMove);
window.addEventListener('mouseup', handleDragEnd);

boardContainer.addEventListener('touchstart', handleDragStart, { passive: true });
window.addEventListener('touchmove', handleDragMove, { passive: true });
window.addEventListener('touchend', handleDragEnd);

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
