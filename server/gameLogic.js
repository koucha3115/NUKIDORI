// カード定義
const BIRDS = [
  { id: 'sparrow',  name: 'スズメ',       emoji: '🐦', count: 6 },
  { id: 'crow',     name: 'カラス',       emoji: '🐧', count: 5 },
  { id: 'owl',      name: 'フクロウ',     emoji: '🦉', count: 4 },
  { id: 'hawk',     name: 'タカ',         emoji: '🦅', count: 3 },
  { id: 'peacock',  name: 'クジャク',     emoji: '🦚', count: 2 },
  { id: 'phoenix',  name: 'フェニックス', emoji: '🔥', count: 1 },
];
const VULTURE = { id: 'vulture', name: 'ハゲタカ', emoji: '💀', count: 4 };
const ALL_BIRD_IDS = BIRDS.map(b => b.id);
const MAX_DAMAGE = 3;

function buildDeck() {
  const deck = [];
  for (const bird of BIRDS) {
    for (let i = 0; i < bird.count; i++) deck.push(bird.id);
  }
  for (let i = 0; i < VULTURE.count; i++) deck.push(VULTURE.id);
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(playerIds) {
  return {
    players: playerIds.map(id => ({
      id,
      board: [],
      boardCount: 0,
      damage: 0,       // 0〜3（3でリセット）
    })),
    deck: buildDeck(),
    phase: 'waiting',
    currentTurn: 0,
    drawnCard: null,
    askOrder: [],
    askIndex: 0,
    responses: {},
    takerIds: [],
    log: [],
    lastResult: null,
  };
}

function drawCard(game) {
  if (game.deck.length === 0) {
    // 山札切れは起きにくいが念のためリシャッフル（全員の盤面カードは除外しない）
    addLog(game, '山札をシャッフルしました');
    game.deck = buildDeck();
  }
  game.drawnCard = game.deck.shift();
  game.phase = 'asking';
  game.responses = {};
  game.takerIds = [];
  const others = game.players
    .filter(p => p.id !== game.players[game.currentTurn].id)
    .map(p => p.id);
  game.askOrder = others;
  game.askIndex = 0;
  return game;
}

function currentAskee(game) {
  return game.askOrder[game.askIndex] ?? null;
}

function respond(game, playerId, choice) {
  game.responses[playerId] = choice;
  if (choice === 'take') {
    game.takerIds.push(playerId);
  }
  game.askIndex++;

  if (game.askIndex >= game.askOrder.length) {
    game.phase = game.takerIds.length > 0 ? 'deciding' : 'pushing';
  }
  return game;
}

function giveCard(game, toPlayerId, playerNames) {
  return placeCard(game, toPlayerId, playerNames, false);
}

function takeCardSelf(game, playerNames) {
  const currentPlayer = game.players[game.currentTurn];
  // 自分で取る = 結果フェーズでカードが可視化される
  return placeCard(game, currentPlayer.id, playerNames, true);
}

function pushCard(game, toPlayerId, playerNames) {
  return placeCard(game, toPlayerId, playerNames, false);
}

// revealToSelf: 引いた本人が自分でカードを取ったとき true → lastResult で可視化
function placeCard(game, toPlayerId, playerNames, revealToSelf) {
  const target = game.players.find(p => p.id === toPlayerId);
  const card = game.drawnCard;
  const toName = (playerNames && playerNames[toPlayerId]) ?? toPlayerId;
  const isSelf = game.players[game.currentTurn].id === toPlayerId;

  addLog(game, `${cardEmoji(card)}${isSelf && !revealToSelf ? '？' : cardName(card)} が ${toName} の盤面へ`);

  target.board.push(card);
  target.boardCount = target.board.length;

  let damageDone = 0;
  let resetOccurred = false;
  let damageReason = '';

  // ダメージ判定
  if (card === 'vulture') {
    damageDone = 1;
    damageReason = 'ハゲタカ入手';
  } else {
    const sameCount = target.board.filter(c => c === card).length;
    if (sameCount >= 2) {
      damageDone = 1;
      damageReason = `${cardName(card)} が2枚揃い`;
    }
  }

  if (damageDone > 0) {
    target.damage += damageDone;
    if (target.damage >= MAX_DAMAGE) {
      // リセット：手持ちカードを山札に返してシャッフル
      resetOccurred = true;
      game.deck.push(...target.board);
      game.deck = shuffle(game.deck);
      addLog(game, `💥 ${damageReason}！ ${toName} が3ダメージ → 盤面リセット！`);
      target.board = [];
      target.boardCount = 0;
      target.damage = 0;
    } else {
      addLog(game, `⚠️ ${damageReason}！ ${toName} に${target.damage}ダメージ（あと${MAX_DAMAGE - target.damage}でリセット）`);
    }
  }

  game.drawnCard = null;
  game.phase = 'result';
  game.lastResult = {
    cardId: card,
    cardName: cardName(card),
    cardEmoji: cardEmoji(card),
    toId: toPlayerId,
    toName,
    revealCard: !isSelf || revealToSelf, // 自分で取った or 他人に渡したときは表示
    damageDone,
    damageTotal: target.damage,
    resetOccurred,
  };

  // 勝利判定（リセットなし + 5種類揃い）
  if (!resetOccurred) {
    const uniqueKinds = new Set(target.board.filter(c => ALL_BIRD_IDS.includes(c)));
    if (uniqueKinds.size >= 5) {
      game.phase = 'gameover';
      game.winner = toPlayerId;
      addLog(game, `🎉 ${toName} が5種類を揃えて勝利！`);
    }
  }

  return game;
}

function nextTurn(game) {
  game.currentTurn = (game.currentTurn + 1) % game.players.length;
  game.phase = 'drawing';
  game.drawnCard = null;
  game.askOrder = [];
  game.askIndex = 0;
  game.responses = {};
  game.takerIds = [];
  game.lastResult = null;
  return game;
}

function forceEndCheck(game, playerNames) {
  let best = null;
  let bestCount = -1;
  for (const p of game.players) {
    const unique = new Set(p.board.filter(c => ALL_BIRD_IDS.includes(c))).size;
    if (unique > bestCount) {
      bestCount = unique;
      best = p.id;
    }
  }
  game.winner = best;
  game.phase = 'gameover';
  const bestName = (playerNames && playerNames[best]) ?? best;
  addLog(game, `ゲーム終了！ ${bestName} が最多${bestCount}種類で勝利！`);
  return game;
}

function cardName(cardId) {
  if (cardId === 'vulture') return VULTURE.name;
  return BIRDS.find(b => b.id === cardId)?.name ?? cardId;
}

function cardEmoji(cardId) {
  if (cardId === 'vulture') return VULTURE.emoji;
  return BIRDS.find(b => b.id === cardId)?.emoji ?? '?';
}

function addLog(game, msg) {
  game.log.push(msg);
  if (game.log.length > 30) game.log.shift();
}

function stateForPlayer(game, playerId, playerNames) {
  const turner = game.players[game.currentTurn];
  const isDrawer = turner?.id === playerId;

  return {
    phase: game.phase,
    currentTurnId: turner?.id,
    // 引いた本人は ?, 他の人は実物が見える
    drawnCard: (() => {
      if (!game.drawnCard) return null;
      if (isDrawer) return { id: 'unknown', name: '？', emoji: '❓' };
      return { id: game.drawnCard, name: cardName(game.drawnCard), emoji: cardEmoji(game.drawnCard) };
    })(),
    askOrder: game.askOrder,
    askIndex: game.askIndex,
    currentAskeeId: currentAskee(game),
    takerIds: game.takerIds,
    deckCount: game.deck.length,
    players: game.players.map(p => ({
      id: p.id,
      name: playerNames[p.id] ?? p.id,
      isMe: p.id === playerId,
      boardCount: p.boardCount,
      // 自分の盤面は自分だけ見える。他人からは隠す
      board: p.id === playerId
        ? p.board.map(c => ({ id: c, name: cardName(c), emoji: cardEmoji(c) }))
        : p.board.map(() => ({ id: 'unknown', name: '？', emoji: '❓' })),
      damage: p.damage,
      warning: p.damage >= 1,
    })),
    log: game.log,
    lastResult: game.lastResult,
    winner: game.winner ?? null,
    winnerName: game.winner ? (playerNames[game.winner] ?? game.winner) : null,
  };
}

module.exports = {
  createGame, drawCard, respond, giveCard, takeCardSelf, pushCard,
  nextTurn, forceEndCheck, stateForPlayer, currentAskee,
  BIRDS, VULTURE,
};
