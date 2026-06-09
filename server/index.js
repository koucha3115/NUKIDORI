const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  createGame, drawCard, respond, giveCard, takeCardSelf, pushCard,
  nextTurn, forceEndCheck, stateForPlayer, currentAskee,
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

// ルーム管理
// rooms[roomId] = { game, playerNames: { socketId: name }, hostId }
const rooms = {};

function getRoomId(socket) {
  return [...socket.rooms].find(r => r !== socket.id);
}

function broadcast(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  for (const [sid, name] of Object.entries(room.playerNames)) {
    const state = stateForPlayer(room.game, sid, room.playerNames);
    io.to(sid).emit('gameState', state);
  }
}

io.on('connection', (socket) => {

  // ルーム作成
  socket.on('createRoom', ({ name }, cb) => {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    rooms[roomId] = {
      game: null,
      playerNames: { [socket.id]: name },
      hostId: socket.id,
    };
    socket.join(roomId);
    cb({ roomId });
    io.to(roomId).emit('roomUpdate', roomInfo(roomId));
  });

  // ルーム入室
  socket.on('joinRoom', ({ roomId, name }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ error: 'ルームが見つかりません' });
    if (room.game) return cb({ error: 'ゲームはすでに始まっています' });
    if (Object.keys(room.playerNames).length >= 6) return cb({ error: '満員です（最大6人）' });
    room.playerNames[socket.id] = name;
    socket.join(roomId);
    cb({ roomId });
    io.to(roomId).emit('roomUpdate', roomInfo(roomId));
  });

  // ゲーム開始（ホストのみ）
  socket.on('startGame', () => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    const playerIds = Object.keys(room.playerNames);
    if (playerIds.length < 3) {
      socket.emit('error', '3人以上必要です');
      return;
    }
    room.game = createGame(playerIds);
    room.game.phase = 'drawing';
    broadcast(roomId);
  });

  // カードを引く（手番プレイヤーのみ）
  socket.on('draw', () => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game) return;
    const turner = room.game.players[room.game.currentTurn];
    if (turner.id !== socket.id) return;
    if (room.game.phase !== 'drawing') return;
    drawCard(room.game);
    broadcast(roomId);
  });

  // 聞く順番を手番プレイヤーがセット（オプション：デフォルトは時計回りのまま）
  socket.on('setAskOrder', ({ order }) => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game) return;
    const turner = room.game.players[room.game.currentTurn];
    if (turner.id !== socket.id) return;
    if (room.game.phase !== 'asking') return;
    // orderはplayerIdの配列（自分以外）
    room.game.askOrder = order;
    room.game.askIndex = 0;
    broadcast(roomId);
  });

  // 「もらう」「いらん」の回答
  socket.on('respond', ({ choice }) => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game) return;
    if (room.game.phase !== 'asking') return;
    if (currentAskee(room.game) !== socket.id) return;
    respond(room.game, socket.id, choice); // choice: 'take' | 'pass'
    broadcast(roomId);
  });

  // 手番プレイヤーが「渡す」を選択
  socket.on('give', ({ toPlayerId }) => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game) return;
    if (room.game.phase !== 'deciding') return;
    const turner = room.game.players[room.game.currentTurn];
    if (turner.id !== socket.id) return;
    giveCard(room.game, toPlayerId);
    broadcast(roomId);
  });

  // 手番プレイヤーが「自分で取る」
  socket.on('takeSelf', () => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game) return;
    if (room.game.phase !== 'deciding') return;
    const turner = room.game.players[room.game.currentTurn];
    if (turner.id !== socket.id) return;
    takeCardSelf(room.game);
    broadcast(roomId);
  });

  // 全員いらん → 押し付け
  socket.on('push', ({ toPlayerId }) => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game) return;
    if (room.game.phase !== 'pushing') return;
    const turner = room.game.players[room.game.currentTurn];
    if (turner.id !== socket.id) return;
    pushCard(room.game, toPlayerId);
    broadcast(roomId);
  });

  // 結果確認後に次のターンへ
  socket.on('nextTurn', () => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game) return;
    if (room.game.phase !== 'result') return;
    const turner = room.game.players[room.game.currentTurn];
    if (turner.id !== socket.id) return;
    nextTurn(room.game);
    broadcast(roomId);
  });

  // 強制終了（ホストのみ）
  socket.on('forceEnd', () => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room?.game || room.hostId !== socket.id) return;
    forceEndCheck(room.game);
    broadcast(roomId);
  });

  // もう一度プレイ
  socket.on('restart', () => {
    const roomId = getRoomId(socket);
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    const playerIds = Object.keys(room.playerNames);
    room.game = createGame(playerIds);
    room.game.phase = 'drawing';
    broadcast(roomId);
  });

  // 切断
  socket.on('disconnect', () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.playerNames[socket.id]) {
        delete room.playerNames[socket.id];
        if (Object.keys(room.playerNames).length === 0) {
          delete rooms[roomId];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = Object.keys(room.playerNames)[0];
          }
          io.to(roomId).emit('roomUpdate', roomInfo(roomId));
        }
      }
    }
  });
});

function roomInfo(roomId) {
  const room = rooms[roomId];
  return {
    roomId,
    players: Object.entries(room.playerNames).map(([id, name]) => ({
      id, name, isHost: id === room.hostId,
    })),
    started: !!room.game,
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`NUKIDORI サーバー起動中 → http://localhost:${PORT}`);
});
