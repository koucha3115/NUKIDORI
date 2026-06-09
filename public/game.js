const socket = io();

const myName = sessionStorage.getItem('playerName') || '不明';
const roomId = sessionStorage.getItem('roomId');
if (!roomId) { location.href = '/'; }

const deckInfo         = document.getElementById('deckInfo');
const othersArea       = document.getElementById('othersArea');
const drawnCardDisplay = document.getElementById('drawnCardDisplay');
const drawnCardEl      = document.getElementById('drawnCard');
const forceEndBtn      = document.getElementById('forceEndBtn');
const myBoardCount     = document.getElementById('myBoardCount');
const myBoard          = document.getElementById('myBoard');
const logList          = document.getElementById('logList');
const gameoverModal    = document.getElementById('gameoverModal');
const gameoverTitle    = document.getElementById('gameoverTitle');
const gameoverMsg      = document.getElementById('gameoverMsg');
const restartBtn       = document.getElementById('restartBtn');
const waitRestart      = document.getElementById('waitRestart');

const phases = {
  drawing:  document.getElementById('phaseDrawing'),
  asking:   document.getElementById('phaseAsking'),
  deciding: document.getElementById('phaseDeciding'),
  pushing:  document.getElementById('phasePushing'),
  result:   document.getElementById('phaseResult'),
  waiting:  document.getElementById('phaseWaiting'),
};

let isHost = false;
let lastState = null;

// ゲーム画面では reconnectGame で再接続
socket.emit('reconnectGame', { roomId, name: myName }, ({ ok, error }) => {
  if (error) {
    alert('ルームへの再接続に失敗しました。ロビーに戻ります。');
    location.href = '/';
  }
});

socket.on('gameState', (state) => {
  lastState = state;
  render(state);
});

// ===== レンダリング =====
function render(s) {
  deckInfo.textContent = `山札: ${s.deckCount} 枚`;

  const me = s.players.find(p => p.isMe);
  // ホスト = players配列の最初のプレイヤーと名前が一致
  isHost = s.players[0]?.name === myName;

  renderOthers(s);

  if (me) {
    myBoardCount.textContent = me.boardCount;
    myBoard.innerHTML = me.board.map(() =>
      `<span class="chip chip-unknown" title="自分の盤面は見えません">❓</span>`
    ).join('') || '<span style="color:#555; font-size:0.8rem">（まだ鳥がいません）</span>';
  }

  if (s.drawnCard) {
    drawnCardDisplay.style.display = 'block';
    const isUnknown = s.drawnCard.id === 'unknown';
    const isVulture = s.drawnCard.id === 'vulture';
    drawnCardEl.className = `card card-large ${isUnknown ? 'is-unknown' : ''} ${isVulture ? 'is-vulture' : ''}`;
    drawnCardEl.innerHTML = `
      <span>${s.drawnCard.emoji}</span>
      <span class="card-name-label">${isUnknown ? '？（自分には見えない）' : s.drawnCard.name}</span>
    `;
  } else {
    drawnCardDisplay.style.display = 'none';
  }

  logList.innerHTML = s.log.map(l => `<li>${l}</li>`).join('');
  logList.scrollTop = logList.scrollHeight;

  if (s.phase === 'gameover') {
    showGameover(s);
    return;
  }

  gameoverModal.style.display = 'none';
  showPhase(s, me);
  forceEndBtn.style.display = isHost ? 'block' : 'none';
}

function renderOthers(s) {
  othersArea.innerHTML = '';
  s.players.forEach(p => {
    if (p.isMe) return;
    const isTurn  = p.id === s.currentTurnId;
    const isAskee = p.id === s.currentAskeeId;
    const classes = [
      'player-card',
      isTurn    ? 'is-turn'    : '',
      p.warning ? 'is-warning' : '',
      isAskee   ? 'is-askee'  : '',
    ].filter(Boolean).join(' ');

    const badges = [
      isTurn    ? '<span class="turn-badge">手番</span>'   : '',
      p.warning ? '<span class="warning-badge">⚠️ 危険</span>' : '',
    ].join('');

    const chips = p.board.map(c => chipHTML(c)).join('')
      || '<span style="color:#555">（なし）</span>';

    othersArea.innerHTML += `
      <div class="${classes}">
        <div class="player-name">${badges} ${p.name}</div>
        <div class="board-chips">${chips}</div>
      </div>
    `;
  });
}

function chipHTML(card) {
  if (card.id === 'unknown') return `<span class="chip chip-unknown">❓</span>`;
  return `<span class="chip" title="${card.name}">${card.emoji}</span>`;
}

function showPhase(s, me) {
  Object.values(phases).forEach(el => el.style.display = 'none');

  const amTurn  = me && s.currentTurnId === me.id;
  const isAskee = me && s.currentAskeeId === me.id;

  if (s.phase === 'drawing' && amTurn) {
    phases.drawing.style.display = 'flex';

  } else if (s.phase === 'asking') {
    phases.asking.style.display = 'flex';
    const askeePlayer = s.players.find(p => p.id === s.currentAskeeId);
    document.getElementById('askingMsg').textContent =
      isAskee ? 'このカード、もらいますか？'
               : `${askeePlayer?.name ?? '？'} に聞いています...`;
    document.getElementById('askingButtons').style.display = isAskee ? 'flex' : 'none';
    document.getElementById('waitingAsk').style.display    = isAskee ? 'none' : 'block';

  } else if (s.phase === 'deciding' && amTurn) {
    phases.deciding.style.display = 'flex';
    const takerBtns = document.getElementById('takerButtons');
    takerBtns.innerHTML = '';
    s.takerIds.forEach(tid => {
      const tname = s.players.find(p => p.id === tid)?.name ?? tid;
      const btn = document.createElement('button');
      btn.className = 'btn btn-success';
      btn.textContent = `${tname} に渡す`;
      btn.onclick = () => socket.emit('give', { toPlayerId: tid });
      takerBtns.appendChild(btn);
    });

  } else if (s.phase === 'pushing' && amTurn) {
    phases.pushing.style.display = 'flex';
    const pushBtns = document.getElementById('pushButtons');
    pushBtns.innerHTML = '';
    s.players.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger';
      btn.textContent = p.isMe ? '自分に押し付ける' : `${p.name} に押し付ける`;
      btn.onclick = () => socket.emit('push', { toPlayerId: p.id });
      pushBtns.appendChild(btn);
    });

  } else if (s.phase === 'result') {
    phases.result.style.display = 'flex';

    // lastResult があれば詳細なメッセージを表示
    let msg = '';
    if (s.lastResult) {
      const r = s.lastResult;
      const isMe = r.toId === me?.id;
      const toLabel = isMe ? 'あなた' : r.toName;
      if (r.exploded) {
        msg = `💥 ${toLabel} の盤面がリセット！`;
      } else {
        msg = `${r.cardEmoji}${r.cardName} が ${toLabel} の盤面へ`;
        if (isMe) msg += `（あなたの盤面：${me.boardCount}羽）`;
      }
    } else {
      msg = s.log[s.log.length - 1] ?? '';
    }
    document.getElementById('resultMsg').textContent = msg;
    document.getElementById('nextTurnBtn').style.display   = amTurn ? 'block' : 'none';
    document.getElementById('waitingResult').style.display = amTurn ? 'none'  : 'block';

  } else {
    phases.waiting.style.display = 'flex';
    const turner = s.players.find(p => p.id === s.currentTurnId);
    document.getElementById('waitingMsg').textContent =
      turner ? `${turner.name} の手番です...` : '待機中...';
  }
}

function showGameover(s) {
  gameoverModal.style.display = 'flex';
  const iWon = s.players.find(p => p.isMe)?.name === s.winnerName;
  gameoverTitle.textContent = iWon ? '🎉 あなたの勝利！' : `${s.winnerName} の勝利！`;
  gameoverMsg.textContent   = '6種類の鳥を集めました！';
  restartBtn.style.display  = isHost ? 'block' : 'none';
  waitRestart.style.display = isHost ? 'none'  : 'block';
}

// ===== ボタンイベント =====
document.getElementById('drawBtn').addEventListener('click', () => socket.emit('draw'));
document.getElementById('takeBtn').addEventListener('click', () => socket.emit('respond', { choice: 'take' }));
document.getElementById('passBtn').addEventListener('click', () => socket.emit('respond', { choice: 'pass' }));
document.getElementById('takeSelfBtn').addEventListener('click', () => socket.emit('takeSelf'));
document.getElementById('nextTurnBtn').addEventListener('click', () => socket.emit('nextTurn'));
forceEndBtn.addEventListener('click', () => {
  if (confirm('強制終了しますか？最多種類のプレイヤーが勝者になります。')) {
    socket.emit('forceEnd');
  }
});
restartBtn.addEventListener('click', () => socket.emit('restart'));
