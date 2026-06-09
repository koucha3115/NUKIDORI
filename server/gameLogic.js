// カード定義
const BIRDS = [
  { id: 'sparrow',  name: 'スズメ',     emoji: '🐦', count: 6 },
  { id: 'crow',     name: 'カラス',     emoji: '🐧', count: 5 },
  { id: 'owl',      name: 'フクロウ',   emoji: '🦉', count: 4 },
  { id: 'hawk',     name: 'タカ',       emoji: '🦅', count: 3 },
  { id: 'peacock',  name: 'クジャク',   emoji: '🦚', count: 2 },
  { id: 'phoenix',  name: 'フェニックス', emoji: '🔥', count: 1 },
];
const VULTURE = { id: 'vulture', name: 'ハゲタカ', emoji: '💀', count: 4 };
const ALL_BIRD_IDS = BIRDS.map(b => b.id);

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
      board: [],      // 盤面のカードID配列（本人には送らない）
      boardCount: 0,  // 枚数（本人にも送る）
    })),
    deck: buildDeck(),
    discardPile: [],
    phase: 'waiting',   // waiting | drawing | asking | deciding | pushing | result
    currentTurn: 0,     // players配列のindex
    drawnCard: null,    // 今掲げているカードID
    askOrder: [],       // 聞く順番（playerIdの配列）
    askIndex: 0,        // 今何人目に聞いているか
    responses: {},      // { playerId: 'take' | 'pass' }
    takerIds: [],       // 「もらう」と言ったplayerIdリスト
    log: [],
  };
}

function drawCard(game) {
  if (game.deck.length === 0) {
    game.deck = shuffle(game.discardPile);
    game.discardPile = [];
  }
  game.drawnCard = game.deck.shift();
  game.phase = 'asking';
  game.responses = {};
  game.takerIds = [];
  // 聞く順番は現在の手番プレイヤーが決める（初期値：時計回り）
  const others = game.players
    .filter(p => p.id !== game.players[game.currentTurn].id)
    .map(p => p.id);
  game.askOrder = others;
  game.askIndex = 0;
  return game;
}

// 現在聞かれているプレイヤーID
function currentAskee(game) {
  return game.askOrder[game.askIndex] ?? null;
}

function respond(game, playerId, choice) {
  // choice: 'take' | 'pass'
  game.responses[playerId] = choice;
  if (choice === 'take') {
    game.takerIds.push(playerId);
  }
  game.askIndex++;

  if (game.askIndex >= game.askOrder.length) {
    // 全員に聞き終わった
    if (game.takerIds.length > 0) {
      // 「もらう」と言った人がいる → 手番プレイヤーが渡すか取るか決める
      game.phase = 'deciding';
    } else {
      // 全員「いらん」→ 押し付けフェーズ
      game.phase = 'pushing';
    }
  }
  return game;
}

// 手番プレイヤーが「渡す」を選択
function giveCard(game, toPlayerId) {
  return placeCard(game, toPlayerId);
}

// 手番プレイヤーが「自分で取る」を選択
function takeCardSelf(game) {
  const currentPlayer = game.players[game.currentTurn];
  return placeCard(game, currentPlayer.id);
}

// 全員いらんで押し付け
function pushCard(game, toPlayerId) {
  return placeCard(game, toPlayerId);
}

function placeCard(game, toPlayerId) {
  const target = game.players.find(p => p.id === toPlayerId);
  const card = game.drawnCard;

  addLog(game, `カード「${cardName(card)}」が ${playerName(game, toPlayerId)} の盤面へ`);

  // 爆発判定
  let exploded = false;
  if (card === 'vulture') {
    // ハゲタカ → 即爆発
    exploded = true;
    game.discardPile.push(card);
    addLog(game, `⚠️ ハゲタカ！ ${playerName(game, toPlayerId)} の盤面がリセット！`);
    resetBoard(game, target);
  } else {
    target.board.push(card);
    target.boardCount = target.board.length;
    const sameCount = target.board.filter(c => c === card).length;
    if (sameCount >= 3) {
      // 3羽 → 爆発
      exploded = true;
      addLog(game, `💥 ${cardName(card)} が3羽！ ${playerName(game, toPlayerId)} の盤面がリセット！`);
      game.discardPile.push(...target.board);
      resetBoard(game, target);
    }
  }

  game.drawnCard = null;
  game.phase = 'result';

  // 勝利チェック
  if (!exploded) {
    const uniqueKinds = new Set(target.board.filter(c => ALL_BIRD_IDS.includes(c)));
    if (uniqueKinds.size >= 6) {
      game.phase = 'gameover';
      game.winner = toPlayerId;
      addLog(game, `🎉 ${playerName(game, toPlayerId)} が6種類を揃えて勝利！`);
      return game;
    }
  }

  return game;
}

function resetBoard(game, player) {
  player.board = [];
  player.boardCount = 0;
}

function nextTurn(game) {
  // 次のプレイヤーへ（時計回り）
  game.currentTurn = (game.currentTurn + 1) % game.players.length;
  game.phase = 'drawing';
  game.drawnCard = null;
  game.askOrder = [];
  game.askIndex = 0;
  game.responses = {};
  game.takerIds = [];
  return game;
}

// 山札切れ膠着時の強制終了判定
function forceEndCheck(game) {
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
  addLog(game, `ゲーム終了！ ${playerName(game, best)} が最多${bestCount}種類で勝利！`);
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

function playerName(game, playerId) {
  return playerId; // ルーム管理側で名前を持つ
}

function addLog(game, msg) {
  game.log.push(msg);
  if (game.log.length > 30) game.log.shift();
}

// クライアントに送る状態（プレイヤーごとに自分の盤面の中身を隠す）
function stateForPlayer(game, playerId, playerNames) {
  return {
    phase: game.phase,
    currentTurnId: game.players[game.currentTurn]?.id,
    drawnCard: (() => {
      // 引いた本人には種類を隠す
      const turner = game.players[game.currentTurn];
      if (!game.drawnCard) return null;
      if (turner?.id === playerId) return { id: 'unknown', name: '？', emoji: '❓' };
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
      // 自分の盤面は中身を隠す
      board: p.id === playerId
        ? p.board.map(() => ({ id: 'unknown', name: '？', emoji: '❓' }))
        : p.board.map(c => ({ id: c, name: cardName(c), emoji: cardEmoji(c) })),
      // 危険状態チェック（自分の盤面も他者から見えるので計算はサーバー側）
      warning: hasWarning(p.board),
    })),
    log: game.log,
    winner: game.winner ?? null,
    winnerName: game.winner ? (playerNames[game.winner] ?? game.winner) : null,
  };
}

function hasWarning(board) {
  const counts = {};
  for (const c of board) {
    if (c === 'vulture') continue;
    counts[c] = (counts[c] ?? 0) + 1;
    if (counts[c] >= 2) return true;
  }
  return false;
}

module.exports = {
  createGame, drawCard, respond, giveCard, takeCardSelf, pushCard,
  nextTurn, forceEndCheck, stateForPlayer, currentAskee,
  BIRDS, VULTURE,
};
