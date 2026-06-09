const socket = io();

const playerNameInput = document.getElementById('playerName');
const roomIdInput     = document.getElementById('roomIdInput');
const createBtn       = document.getElementById('createBtn');
const joinBtn         = document.getElementById('joinBtn');
const lobbyError      = document.getElementById('lobbyError');
const waitingRoom     = document.getElementById('waitingRoom');
const displayRoomId   = document.getElementById('displayRoomId');
const shareUrl        = document.getElementById('shareUrl');
const copyBtn         = document.getElementById('copyBtn');
const playerList      = document.getElementById('playerList');
const startBtn        = document.getElementById('startBtn');
const waitMsg         = document.getElementById('waitMsg');

let myRoomId = null;

function showError(msg) {
  lobbyError.textContent = msg;
  lobbyError.style.display = 'block';
}

function getName() {
  const n = playerNameInput.value.trim();
  if (!n) { showError('名前を入力してください'); return null; }
  return n;
}

createBtn.addEventListener('click', () => {
  const name = getName();
  if (!name) return;
  socket.emit('createRoom', { name }, ({ roomId, error }) => {
    if (error) return showError(error);
    myRoomId = roomId;
    showWaiting(roomId);
  });
});

joinBtn.addEventListener('click', () => {
  const name = getName();
  if (!name) return;
  const roomId = roomIdInput.value.trim().toUpperCase();
  if (!roomId) return showError('ルームIDを入力してください');
  socket.emit('joinRoom', { roomId, name }, ({ roomId: rid, error }) => {
    if (error) return showError(error);
    myRoomId = rid;
    showWaiting(rid);
  });
});

function showWaiting(roomId) {
  lobbyError.style.display = 'none';
  waitingRoom.style.display = 'block';
  displayRoomId.textContent = roomId;
  const url = `${location.origin}/?room=${roomId}`;
  shareUrl.value = url;
}

copyBtn.addEventListener('click', () => {
  const url = shareUrl.value;
  if (!url) return;

  // まずinputを選択状態にして視覚フィードバック
  shareUrl.select();
  shareUrl.setSelectionRange(0, 99999);

  // clipboard API を試す
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => showCopied())
      .catch(() => legacyCopy());
  } else {
    legacyCopy();
  }
});

function legacyCopy() {
  try {
    document.execCommand('copy');
    showCopied();
  } catch (e) {
    // 手動コピーを促す
    copyBtn.textContent = '手動でコピーしてください';
    setTimeout(() => copyBtn.textContent = 'コピー', 3000);
  }
}

function showCopied() {
  copyBtn.textContent = '✅ コピー済み！';
  setTimeout(() => copyBtn.textContent = 'コピー', 2000);
}

startBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

socket.on('roomUpdate', ({ players, started }) => {
  playerList.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `${p.isHost ? '<span class="host-badge">HOST</span>' : ''} ${p.name}`;
    playerList.appendChild(li);
  });
  const me = players.find(p => p.id === socket.id);
  const isHost = me?.isHost ?? false;
  startBtn.style.display = isHost ? 'block' : 'none';
  waitMsg.style.display  = isHost ? 'none'  : 'block';
  startBtn.disabled = players.length < 3;
  if (started) goToGame();
});

socket.on('gameState', () => goToGame());

function goToGame() {
  sessionStorage.setItem('playerName', playerNameInput.value.trim());
  sessionStorage.setItem('roomId', myRoomId);
  location.href = 'game.html';
}

// URLパラメータからルームIDを自動入力
const params = new URLSearchParams(location.search);
const roomParam = params.get('room');
if (roomParam) {
  roomIdInput.value = roomParam.toUpperCase();
}
