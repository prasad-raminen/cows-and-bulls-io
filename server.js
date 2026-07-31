const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WORD_LIST = require('./words.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

// Helper: Generate 4 unique digits using ONLY 1-9 (No zero!)
function generateNumberSecret() {
  const digits = ['1','2','3','4','5','6','7','8','9'];
  let secret = '';
  while (secret.length < 4) {
    const idx = Math.floor(Math.random() * digits.length);
    secret += digits[idx];
    digits.splice(idx, 1);
  }
  return secret;
}

function generateWordSecret() {
  const idx = Math.floor(Math.random() * WORD_LIST.length);
  return WORD_LIST[idx];
}

// Strict Bulls & Cows Math (No duplicate counting)
function calculateBullsAndCows(secret, guess) {
  let bulls = 0, cows = 0;
  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) {
      bulls++;
    } else if (secret.includes(guess[i])) {
      cows++;
    }
  }
  return { bulls, cows };
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, mode, gameType, team }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        secret: mode === 'number' ? generateNumberSecret() : generateWordSecret(),
        mode,
        gameType, // "race", "team", or "1v1"
        players: {},
        customSecrets: {} // Used for 1v1 mode
      };
    }

    rooms[roomId].players[socket.id] = { team: team || null, id: socket.id };
    
    // Tell frontend if this room requires setting a custom secret first (1v1 Mode)
    const is1v1 = (rooms[roomId].gameType === '1v1');
    socket.emit('room_joined', { roomId, mode: rooms[roomId].mode, is1v1 });
  });

  // Handle 1v1 players submitting their secret code for their opponent
  socket.on('set_custom_secret', ({ roomId, secret }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.customSecrets[socket.id] = secret.toUpperCase();
    socket.emit('secret_locked');

    // If both players have set their secret code, start the duel!
    if (Object.keys(room.customSecrets).length >= 2) {
      io.to(roomId).emit('1v1_ready');
    }
  });

  socket.on('submit_guess', ({ roomId, guess }) => {
    const room = rooms[roomId];
    if (!room) return;

    const formattedGuess = guess.toUpperCase();
    let targetSecret = room.secret;

    // In 1v1 Mode, you are trying to guess your OPPONENT'S secret code!
    if (room.gameType === '1v1') {
      const opponentId = Object.keys(room.customSecrets).find(id => id !== socket.id);
      if (opponentId) {
        targetSecret = room.customSecrets[opponentId];
      }
    }

    const { bulls, cows } = calculateBullsAndCows(targetSecret, formattedGuess);
    const isWin = (bulls === 4);
    const player = room.players[socket.id];

    if (room.gameType === 'team' && player.team) {
      io.to(roomId).emit('team_feed_update', {
        sender: socket.id.slice(0, 4),
        team: player.team,
        guess: formattedGuess,
        bulls,
        cows,
        isWin
      });
    } else {
      socket.emit('guess_result', { guess: formattedGuess, bulls, cows, isWin });
      socket.to(roomId).emit('rival_progress', {
        player: socket.id.slice(0, 4),
        bulls,
        cows,
        isWin
      });
    }
  });

  socket.on('restart_game', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.secret = room.mode === 'number' ? generateNumberSecret() : generateWordSecret();
    room.customSecrets = {}; // Clear 1v1 secrets
    io.to(roomId).emit('round_restarted', { is1v1: (room.gameType === '1v1') });
  });

  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      delete rooms[roomId].players[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});