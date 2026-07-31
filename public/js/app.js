const socket = io();

// UI Elements
const menuContainer = document.getElementById('menu-container');
const gameContainer = document.getElementById('game-container');
const typeSelect = document.getElementById('type-select');
const teamPicker = document.getElementById('team-picker');
const toggleCreate = document.getElementById('toggle-create');
const toggleJoin = document.getElementById('toggle-join');
const joinCodeBox = document.getElementById('join-code-box');
const actionBtn = document.getElementById('action-btn');
const roomInput = document.getElementById('room-input');
const leaveBtn = document.getElementById('leave-btn');

const setupBox = document.getElementById('setup-box');
const secretForm = document.getElementById('secret-form');
const secretInput = document.getElementById('secret-input');
const secretBtn = document.getElementById('secret-btn');

const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const historyLog = document.getElementById('history-log');
const victoryBanner = document.getElementById('victory-banner');
const winnerText = document.getElementById('winner-text');
const restartBtn = document.getElementById('restart-btn');
const errorMsg = document.getElementById('error-msg');

let currentRoom = '';
let currentMode = 'number';
let isCreatingRoom = true;

// Handle UI Toggles
toggleCreate.addEventListener('click', () => {
  isCreatingRoom = true;
  toggleCreate.classList.add('active');
  toggleJoin.classList.remove('active');
  joinCodeBox.classList.add('hidden');
  actionBtn.innerText = 'Create Room & Play 🚀';
});

toggleJoin.addEventListener('click', () => {
  isCreatingRoom = false;
  toggleJoin.classList.add('active');
  toggleCreate.classList.remove('active');
  joinCodeBox.classList.remove('hidden');
  actionBtn.innerText = 'Join Room 🤝';
  roomInput.focus();
});

typeSelect.addEventListener('change', (e) => {
  teamPicker.classList.toggle('hidden', e.target.value !== 'team');
});

function generateRandomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// 1. Enter Room
actionBtn.addEventListener('click', () => {
  const mode = document.getElementById('mode-select').value;
  const gameType = document.getElementById('type-select').value;
  const team = document.getElementById('team-select').value;
  
  let roomId = isCreatingRoom ? generateRandomRoomCode() : roomInput.value.trim().toUpperCase();
  if (!roomId || roomId.length < 3) return alert('Please enter a valid room invite code!');

  currentRoom = roomId;
  currentMode = mode;
  socket.emit('join_room', { roomId, mode, gameType, team });
});

// 2. Dashboard Back Button
leaveBtn.addEventListener('click', () => {
  socket.emit('leave_room', { roomId: currentRoom });
  gameContainer.classList.add('hidden');
  menuContainer.classList.remove('hidden');
  historyLog.innerHTML = '';
  resetBoardState();
});

restartBtn.addEventListener('click', () => {
  socket.emit('restart_game', { roomId: currentRoom });
});

// 3. Room Joined Setup
socket.on('room_joined', ({ roomId, mode, is1v1 }) => {
  menuContainer.classList.add('hidden');
  gameContainer.classList.remove('hidden');
  document.getElementById('room-title').innerText = `${roomId} (${mode.toUpperCase()})`;
  
  resetBoardState();

  // If 1v1 Mode, show the Secret Setup Box first and disable guessing!
  if (is1v1) {
    setupBox.classList.remove('hidden');
    guessInput.disabled = true;
    guessBtn.disabled = true;
    secretInput.focus();
  } else {
    guessInput.focus();
  }
});

// ==========================================
// STRICT INPUT VALIDATOR (No Zeroes, No Duplicates)
// ==========================================
function validateInput(val, mode) {
  if (val.length !== 4) return "Must be exactly 4 characters long!";
  
  // 1. Check for duplicates using a Set
  const uniqueChars = new Set(val.split(''));
  if (uniqueChars.size !== 4) {
    return "All 4 digits/letters must be UNIQUE (No repeating characters)!";
  }

  // 2. Mode-specific rules
  if (mode === 'number') {
    if (!/^[1-9]{4}$/.test(val)) {
      return "Only use numbers 1 to 9 (Zero '0' is NOT allowed)!";
    }
  } else {
    if (!/^[A-Z]{4}$/.test(val)) {
      return "Only use alphabet letters (A-Z)!";
    }
  }
  return null; // Valid!
}

function showError(msg) {
  errorMsg.innerText = "⚠️ " + msg;
  errorMsg.classList.remove('hidden');
  setTimeout(() => errorMsg.classList.add('hidden'), 4000);
}

// 4. Submit 1v1 Custom Secret
secretForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const secret = secretInput.value.trim().toUpperCase();
  const error = validateInput(secret, currentMode);
  
  if (error) return showError(error);

  socket.emit('set_custom_secret', { roomId: currentRoom, secret });
});

socket.on('secret_locked', () => {
  setupBox.innerHTML = `<h3>✅ Secret Code Locked In!</h3><p>Waiting for your opponent to set their secret code...</p>`;
});

socket.on('1v1_ready', () => {
  setupBox.classList.add('hidden');
  guessInput.disabled = false;
  guessBtn.disabled = false;
  guessInput.focus();
  showError("Both players are ready! Guess your opponent's code!");
});

// 5. Submit Guess
guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const guess = guessInput.value.trim().toUpperCase();
  const error = validateInput(guess, currentMode);
  
  if (error) {
    return showError(error);
  }

  errorMsg.classList.add('hidden');
  socket.emit('submit_guess', { roomId: currentRoom, guess });
  guessInput.value = '';
});

// Handle Results
socket.on('guess_result', ({ guess, bulls, cows, isWin }) => {
  addHistoryRow('YOU', guess, bulls, cows, isWin);
  if (isWin) triggerWinState('🎉 You cracked the secret code!');
});

socket.on('rival_progress', ({ player, bulls, cows, isWin }) => {
  addHistoryRow(`Player #${player}`, '????', bulls, cows, isWin);
  if (isWin) triggerWinState(`🚨 Player #${player} solved the code first!`);
});

socket.on('team_feed_update', ({ sender, team, guess, bulls, cows, isWin }) => {
  addHistoryRow(`[${team}] #${sender}`, guess, bulls, cows, isWin);
  if (isWin) triggerWinState(`🏆 TEAM ${team} WON THE ROUND!`);
});

socket.on('round_restarted', ({ is1v1 }) => {
  historyLog.innerHTML = '';
  resetBoardState();
  if (is1v1) {
    setupBox.classList.remove('hidden');
    setupBox.innerHTML = `
      <h3>🔒 1v1 Mode: Set Your Secret Code</h3>
      <p id="setup-instructions">Enter a 4-character code for your opponent to guess!</p>
      <form id="secret-form" autocomplete="off">
        <div class="input-group">
          <input type="text" id="secret-input" maxlength="4" placeholder="Type secret..." required />
          <button type="submit" id="secret-btn" class="btn-success">Lock In 🔒</button>
        </div>
      </form>`;
    guessInput.disabled = true;
    guessBtn.disabled = true;
  }
});

function addHistoryRow(who, guessText, bulls, cows, isWin) {
  const tr = document.createElement('tr');
  if (isWin) tr.classList.add('win-row');
  
  tr.innerHTML = `
    <td><strong>${who}</strong></td>
    <td style="font-size: 1.1rem; letter-spacing: 2px;"><strong>${guessText}</strong></td>
    <td><span class="bull-badge">${bulls} 🐂</span></td>
    <td><span class="cow-badge">${cows} 🐄</span></td>
  `;
  historyLog.insertBefore(tr, historyLog.firstChild);
}

function triggerWinState(message) {
  winnerText.innerText = message;
  victoryBanner.classList.remove('hidden');
  guessInput.disabled = true;
  guessBtn.disabled = true;
}

function resetBoardState() {
  victoryBanner.classList.add('hidden');
  errorMsg.classList.add('hidden');
  setupBox.classList.add('hidden');
  guessInput.disabled = false;
  guessBtn.disabled = false;
  guessInput.value = '';
}