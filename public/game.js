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

  // デッキ残数内訳
  const deckBreakEl = document.getElementById('deckBreakdown');
  if (deckBreakEl && s.deckBreakdown) {
    const CARD_DEF = [
      { id: 'sparrow', emoji: '🐦' }, { id: 'crow',    emoji: '🐧' },
      { id: 'owl',     emoji: '🦉' }, { id: 'hawk',    emoji: '🦅' },
      { id: 'peacock', emoji: '🦚' }, { id: 'phoenix', emoji: '🔥' },
      { id: 'vulture', emoji: '💀' },
    ];
    deckBreakEl.innerHTML = CARD_DEF.map(c => {
      const n = s.deckBreakdown[c.id] ?? 0;
      return `<span class="deck-chip ${n === 0 ? 'deck-empty' : ''}">${c.emoji}×${n}</span>`;
    }).join('');
  }

  const me = s.players.find(p => p.isMe);
  isHost = s.players[0]?.name === myName;

  renderOthers(s);

  if (me) {
    myBoardCount.textContent = me.boardCount;
    // ダメージ表示
    const dmgEl = document.getElementById('myDamage');
    if (dmgEl) {
      const hearts = ['🩶','🩶','🩶'].map((_, i) => i < me.damage ? '💔' : '🩶').join(' ');
      dmgEl.textContent = `ダメージ: ${hearts}`;
    }
    myBoard.innerHTML = me.board.map(c => chipHTML(c)).join('')
      || '<span style="color:#555; font-size:0.8rem">（まだ鳥がいません）</span>';
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
      isTurn ? '<span class="turn-badge">手番</span>' : '',
      p.warning ? `<span class="warning-badge">💔×${p.damage}</span>` : '',
    ].join('');

    // 他人の盤面は隠されている（サーバーが ? を返す）
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
  if (card.id === 'vulture') return `<span class="chip chip-vulture" title="${card.name}">${card.emoji}</span>`;
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
    // 回答済みリスト
    const responseList = document.getElementById('responseList');
    if (responseList) {
      const entries = Object.entries(s.responses ?? {});
      responseList.innerHTML = entries.length === 0 ? '' : entries.map(([name, choice]) =>
        `<span class="response-badge ${choice === 'take' ? 'badge-take' : 'badge-pass'}">
          ${name}：${choice === 'take' ? '🙋 もらう' : '🙅 いらん'}
        </span>`
      ).join('')
    }

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

    let msg = '';
    if (s.lastResult) {
      const r = s.lastResult;
      const isMe = r.toId === me?.id;
      const toLabel = isMe ? 'あなた' : r.toName;

      // カード名（自分で取った or 他人への場合は表示、引いた本人への押し付けでは？）
      const cardLabel = r.revealCard
        ? `${r.cardEmoji}${r.cardName}`
        : `❓`;

      if (r.resetOccurred) {
        msg = `${cardLabel} → 💥 ${toLabel} が3ダメージ！盤面リセット！`;
      } else if (r.damageDone > 0) {
        msg = `${cardLabel} → ⚠️ ${toLabel} に${r.damageTotal}ダメージ！`;
      } else {
        msg = `${cardLabel} が ${toLabel} の盤面へ`;
      }
    } else {
      msg = s.log[s.log.length - 1] ?? '';
    }
    document.getElementById('resultMsg').textContent = msg;
    // 結果フェーズでも全員の回答を表示
    const resultResponses = document.getElementById('resultResponses');
    if (resultResponses) {
      const entries = Object.entries(s.responses ?? {});
      resultResponses.innerHTML = entries.map(([name, choice]) =>
        `<span class="response-badge ${choice === 'take' ? 'badge-take' : 'badge-pass'}">
          ${name}：${choice === 'take' ? '🙋 もらう' : '🙅 いらん'}
        </span>`
      ).join('');
    }
    document.getElementById('nextTurnBtn').style.display   = amTurn ? 'block' : 'none';
    document.getElementById('waitingResult').style.display = amTurn ? 'none'  : 'block';

  } else {
    phases.waiting.style.display = 'flex';
    const turner = s.players.find(p => p.id === s.currentTurnId);
    const turnerName = turner?.name ?? '？';
    let waitMsg = `${turnerName} の手番です...`;
    if (s.phase === 'deciding') waitMsg = `${turnerName} が渡す相手を選んでいます...`;
    if (s.phase === 'pushing')  waitMsg = `${turnerName} が押し付け先を選んでいます...`;
    document.getElementById('waitingMsg').textContent = waitMsg;
  }
}

function showGameover(s) {
  gameoverModal.style.display = 'flex';
  const iWon = s.players.find(p => p.isMe)?.name === s.winnerName;
  gameoverTitle.textContent = iWon ? '🎉 あなたの勝利！' : `${s.winnerName} の勝利！`;
  gameoverMsg.textContent   = '5種類の鳥を集めました！';
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
