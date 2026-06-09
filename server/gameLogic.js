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
      board: [],
      boardCount: 0,
    })),
    deck: buildDeck(),
    discardPile: [],
    phase: 'waiting',
    currentTurn: 0,
    drawnCard: null,
    askOrder: [],
    askIndex: 0,
    responses: {},
    takerIds: [],
    log: [],
    lastResult: null, // { cardId, cardName, cardEmoji, toName, exploded }
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
    if (game.takerIds.length > 0) {
      game.phase = 'deciding';
    } else {
      game.phase = 'pushing';
    }
  }
  return game;
}

function giveCard(game, toPlayerId, playerNames) {
  return placeCard(game, toPlayerId, playerNames);
}

function takeCardSelf(game, playerNames) {
  const currentPlayer = game.players[game.currentTurn];
  return placeCard(game, currentPlayer.id, playerNames);
}

function pushCard(game, toPlayerId, playerNames) {
  return placeCard(game, toPlayerId, playerNames);
}

function placeCard(game, toPlayerId, playerNames) {
  const target = game.players.find(p => p.id === toPlayerId);
  const card = game.drawnCard;
  const toName = (playerNames && playerNames[toPlayerId]) ?? toPlayerId;

  addLog(game, `${cardEmoji(card)}${cardName(card)} が ${toName} の盤面へ`);

  let exploded = false;
  if (card === 'vulture') {
    exploded = true;
    game.discardPile.push(card);
    addLog(game, `💀 ハゲタカ！ ${toName} の盤面がリセット！`);
    resetBoard(game, target);
  } else {
    target.board.push(card);
    target.boardCount = target.board.length;
    const sameCount = target.board.filter(c => c === card).length;
    if (sameCount >= 3) {
      exploded = true;
      addLog(game, `💥 ${cardName(card)} が3羽！ ${toName} の盤面がリセット！`);
      game.discardPile.push(...target.board);
      resetBoard(game, target);
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
    exploded,
  };

  if (!exploded) {
    const uniqueKinds = new Set(target.board.filter(c => ALL_BIRD_IDS.includes(c)));
    if (uniqueKinds.size >= 6) {
      game.phase = 'gameover';
      game.winner = toPlayerId;
      addLog(game, `🎉 ${toName} が6種類を揃えて勝利！`);
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
  return {
    phase: game.phase,
    currentTurnId: game.players[game.currentTurn]?.id,
    drawnCard: (() => {
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
      board: p.id === playerId
        ? p.board.map(() => ({ id: 'unknown', name: '？', emoji: '❓' }))
        : p.board.map(c => ({ id: c, name: cardName(c), emoji: cardEmoji(c) })),
      warning: hasWarning(p.board),
    })),
    log: game.log,
    lastResult: game.lastResult,
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
