// Moteur de jeu : dé, déplacement des dinosaures et des pions, attaques, victoire.
// Opère sur l'objet `state` créé par state.js et ne fait aucun rendu.

import { TILE, findTile } from "./board.js";
import { key, neighbors } from "./hex.js";
import { PHASE, DINO, tileAt, dinoAt } from "./state.js";
import { CARD, shuffle } from "./cards.js";

// Faces du dé "dinosaure" : chaque face = un type de dino + un nombre de cases (1 à 3).
// Reproduit l'esprit du dé original (couleurs de dino + nombres).
export const DIE_FACES = [
  { dino: DINO.RAPTOR, steps: 3 },
  { dino: DINO.RAPTOR, steps: 2 },
  { dino: DINO.SPITTER, steps: 3 },
  { dino: DINO.SPITTER, steps: 2 },
  { dino: DINO.TREX, steps: 2 },
  { dino: DINO.TREX, steps: 1 },
];

export function rollDie(state) {
  const face = DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)];
  state.die = { ...face };
  return state.die;
}

// ---------- Déplacement des dinosaures ----------

// Un dino peut-il TRAVERSER cette case ? Interdit : sheds et Visitor Center.
// Les enclos sont interdits sauf s'il s'agit de la case d'origine du dino.
function dinoCanPass(state, tile, originKey) {
  if (!tile) return false;
  if (tile.type === TILE.SHED || tile.type === TILE.VISITOR_CENTER) return false;
  const isPen = tile.type === TILE.RAPTOR_PEN || tile.type === TILE.SPITTER_PEN;
  if (isPen && key(tile.q, tile.r) !== originKey) return false;
  return true;
}

// Cases où un dino donné peut atterrir (BFS jusqu'à `steps`).
// Ne peut pas finir sur une case occupée par un autre dinosaure.
export function dinoReachable(state, dino, steps) {
  const originKey = key(dino.q, dino.r);
  const visited = new Map([[originKey, 0]]);
  const frontier = [{ q: dino.q, r: dino.r }];
  const landing = new Set();

  while (frontier.length) {
    const cur = frontier.shift();
    const dist = visited.get(key(cur.q, cur.r));
    if (dist >= steps) continue;
    for (const n of neighbors(cur.q, cur.r)) {
      const nk = key(n.q, n.r);
      const tile = tileAt(state, n.q, n.r);
      if (!dinoCanPass(state, tile, originKey)) continue;
      if (visited.has(nk) && visited.get(nk) <= dist + 1) continue;
      visited.set(nk, dist + 1);
      frontier.push({ q: n.q, r: n.r });
      const other = dinoAt(state, n.q, n.r);
      if (!other || other.uid === dino.uid) landing.add(nk); // pas d'atterrissage sur un autre dino
    }
  }
  return landing;
}

// Déplace un dino vers (q, r). Marque qu'il a quitté son enclos.
export function moveDino(state, dino, q, r) {
  dino.q = q;
  dino.r = r;
  if (dino.penKey && key(q, r) !== dino.penKey) dino.leftPen = true;
}

// ---------- Déplacement des pions ----------

// Un pion est "sous attaque" si un dinosaure occupe sa case.
export function isUnderAttack(state, player) {
  return !!dinoAt(state, player.q, player.r);
}

// Cases atteignables par un pion pour un déplacement de base (1 case adjacente).
// Un pion ne peut pas entrer dans un enclos ; il peut atterrir sur une case dino (attaque).
// S'il est déjà sous attaque, il ne peut pas bouger tant qu'il n'a pas fui.
export function pawnBasicReachable(state, player) {
  if (isUnderAttack(state, player)) return new Set();
  const out = new Set();
  for (const n of neighbors(player.q, player.r)) {
    const tile = tileAt(state, n.q, n.r);
    if (!tile) continue;
    if (tile.type === TILE.RAPTOR_PEN || tile.type === TILE.SPITTER_PEN) continue;
    out.add(key(n.q, n.r));
  }
  return out;
}

// Déplace le pion et déclenche la détection de victoire.
export function movePawn(state, player, q, r) {
  player.q = q;
  player.r = r;
  const tile = tileAt(state, q, r);
  if (tile.type === TILE.VISITOR_CENTER) {
    player.arrived = true;
    state.winner = player;
    state.phase = PHASE.GAME_OVER;
  }
}

// ---------- Cartes ----------

// Un pion peut-il TRAVERSER cette case (étape intermédiaire d'un déplacement de carte) ?
// Interdit : enclos et cases occupées par un dinosaure (on ne traverse pas un dino).
function pawnCanPass(state, tile, onlyRoad) {
  if (!tile) return false;
  if (tile.type === TILE.RAPTOR_PEN || tile.type === TILE.SPITTER_PEN) return false;
  if (onlyRoad && tile.type !== TILE.ROAD) return false;
  if (dinoAt(state, tile.q, tile.r)) return false;
  return true;
}

// Cases où un pion peut atterrir avec un déplacement de `min` à `max` cases.
// onlyRoad : chemin exclusivement sur la route. On peut atterrir sur une case dino
// (= sous attaque) mais jamais traverser une case dino.
export function pawnPathReachable(state, player, { min, max, onlyRoad = false }) {
  const visited = new Map([[key(player.q, player.r), 0]]);
  const frontier = [{ q: player.q, r: player.r, d: 0 }];
  const landings = new Set();

  while (frontier.length) {
    const cur = frontier.shift();
    if (cur.d >= max) continue;
    for (const n of neighbors(cur.q, cur.r)) {
      const nk = key(n.q, n.r);
      const tile = tileAt(state, n.q, n.r);
      if (!tile) continue;
      const nd = cur.d + 1;
      const occupied = dinoAt(state, n.q, n.r);

      // Atterrissage possible ici (bonne distance, pas un enclos, route si onlyRoad).
      const landOk =
        nd >= min && tile.type !== TILE.RAPTOR_PEN && tile.type !== TILE.SPITTER_PEN &&
        (!onlyRoad || tile.type === TILE.ROAD);
      if (landOk) landings.add(nk);

      // Poursuite du chemin seulement à travers une case traversable.
      if (!pawnCanPass(state, tile, onlyRoad)) continue;
      if (visited.has(nk) && visited.get(nk) <= nd) continue;
      visited.set(nk, nd);
      frontier.push({ q: n.q, r: n.r, d: nd });
    }
  }
  return landings;
}

// Le pion est-il sur une case adjacente à une route (ou sur la route) ?
function nearRoad(state, player) {
  const here = tileAt(state, player.q, player.r);
  if (here && here.type === TILE.ROAD) return true;
  return neighbors(player.q, player.r).some((n) => {
    const t = tileAt(state, n.q, n.r);
    return t && t.type === TILE.ROAD;
  });
}

// Cases atteignables par une carte donnée (Set vide si la carte n'est pas jouable).
export function cardLandings(state, player, cardType) {
  switch (cardType) {
    case CARD.ESCAPE:
      // Jouable uniquement si sous attaque : avancer d'1 case.
      if (!isUnderAttack(state, player)) return new Set();
      return pawnPathReachable(state, player, { min: 1, max: 1 });
    case CARD.MOVE2:
      if (isUnderAttack(state, player)) return new Set();
      return pawnPathReachable(state, player, { min: 2, max: 2 });
    case CARD.ROAD23:
      if (isUnderAttack(state, player)) return new Set();
      if (!nearRoad(state, player)) return new Set();
      return pawnPathReachable(state, player, { min: 2, max: 3, onlyRoad: true });
    default:
      return new Set();
  }
}

// Une carte de déplacement est jouable s'il existe au moins une destination.
export function cardPlayable(state, player, cardType) {
  if (cardType === CARD.CANCEL) return false; // Cancel = réponse, pas une action
  return cardLandings(state, player, cardType).size > 0;
}

// Pioche une carte (remélange la défausse si la pioche est vide).
export function drawOne(state) {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) return null;
    state.deck = shuffle(state.discard);
    state.discard = [];
  }
  return state.deck.pop();
}

// Complète la main du joueur jusqu'à 4 cartes.
export function refillHand(state, player) {
  while (player.hand.length < 4) {
    const c = drawOne(state);
    if (!c) break;
    player.hand.push(c);
  }
}

// Retire une carte de la main d'un joueur (par index) et la met en défausse.
export function discardFromHand(state, player, index) {
  const [card] = player.hand.splice(index, 1);
  if (card) state.discard.push(card);
  return card;
}

// Échange (Trade In / Bonus Trade) : défausse les cartes choisies et en repioche autant.
export function tradeCards(state, player, indices) {
  const sorted = [...indices].sort((a, b) => b - a);
  const n = sorted.length;
  for (const i of sorted) discardFromHand(state, player, i);
  for (let i = 0; i < n; i++) {
    const c = drawOne(state);
    if (!c) break;
    player.hand.push(c);
  }
}

// Le joueur possède-t-il au moins une carte Cancel ?
export function hasCancel(player) {
  return player.hand.some((c) => c.type === CARD.CANCEL);
}

// ---------- Enchaînement des tours ----------

export function endTurn(state) {
  if (state.phase === PHASE.GAME_OVER) return;
  refillHand(state, state.players[state.current]); // recomplète la main à 4 cartes
  state.die = null;
  do {
    state.current = (state.current + 1) % state.players.length;
  } while (state.players[state.current].arrived);
  state.phase = PHASE.ROLL;
}

export function currentPlayer(state) {
  return state.players[state.current];
}
