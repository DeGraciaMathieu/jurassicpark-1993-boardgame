// État global de la partie : joueurs, pions, dinosaures, phase du tour.
// Aucune logique de rendu ici — uniquement les données et les helpers de lecture.

import { buildBoard, findTile, TILE } from "./board.js";
import { key, neighbors } from "./hex.js";
import { buildDeck } from "./cards.js";

// Couleurs des 4 pions joueurs (cartes "Visitor Pass" du jeu original).
export const PLAYER_COLORS = [
  { id: "red", name: "Rouge", hex: 0xd0342c },
  { id: "blue", name: "Bleu", hex: 0x2f6fb0 },
  { id: "green", name: "Vert", hex: 0x3fa34d },
  { id: "yellow", name: "Jaune", hex: 0xe6c229 },
];

// Types de dinosaures et effectif d'après la boîte : 1 T-Rex, 9 raptors, 6 spitters.
export const DINO = {
  TREX: "trex",
  RAPTOR: "raptor",
  SPITTER: "spitter",
};

// Phases d'un tour : jet du dé (déplacer un dino) puis action du pion.
export const PHASE = {
  ROLL: "roll",       // étape 1 : lancer le dé et déplacer un dino (optionnel)
  ACTION: "action",   // étape 2 : déplacer son pion / jouer une carte / échanger / passer
  GAME_OVER: "gameOver",
};

// Crée l'état initial pour un nombre de joueurs donné (2 à 4).
export function createGame(playerCount) {
  const tiles = buildBoard();
  const start = findTile(tiles, TILE.PAWN_START);
  const deck = buildDeck();

  const players = [];
  for (let i = 0; i < playerCount; i++) {
    const color = PLAYER_COLORS[i];
    players.push({
      id: color.id,
      name: color.name,
      hex: color.hex,
      q: start.q,
      r: start.r,
      hand: deck.splice(0, 4), // main initiale de 4 cartes
      arrived: false,          // a atteint le Visitor Center
    });
  }

  const dinos = placeDinos(tiles);

  return {
    tiles,
    players,
    dinos,
    deck,                // pioche
    discard: [],         // défausse
    current: 0,          // index du joueur courant
    phase: PHASE.ROLL,
    die: null,           // dernier résultat du dé { dino, steps }
    pending: null,       // carte en attente de résolution (fenêtre d'annulation)
    winner: null,
    log: [],
  };
}

// Place les dinosaures sur leurs cases de départ.
// Chaque enclos raptor accueille 3 raptors, chaque enclos spitter 2 spitters,
// et le T-Rex démarre seul (conforme aux effectifs 9 raptors / 6 spitters / 1 T-Rex).
function placeDinos(tiles) {
  const dinos = [];
  let uid = 0;
  const add = (type, q, r, penKey) =>
    dinos.push({ uid: uid++, type, q, r, penKey, leftPen: false });

  for (const t of tiles.values()) {
    if (t.type === TILE.RAPTOR_PEN) {
      const pk = key(t.q, t.r);
      for (let i = 0; i < 3; i++) add(DINO.RAPTOR, t.q, t.r, pk);
    } else if (t.type === TILE.SPITTER_PEN) {
      const pk = key(t.q, t.r);
      for (let i = 0; i < 2; i++) add(DINO.SPITTER, t.q, t.r, pk);
    } else if (t.type === TILE.TREX_START) {
      add(DINO.TREX, t.q, t.r, null);
    }
  }
  return dinos;
}

// Case à la position (q, r), ou undefined si hors plateau (océan).
export function tileAt(state, q, r) {
  return state.tiles.get(key(q, r));
}

// Y a-t-il un dinosaure sur cette case ?
export function dinoAt(state, q, r) {
  return state.dinos.find((d) => d.q === q && d.r === r);
}

// Voisins praticables pour un PION depuis (q, r).
// Règles : un pion ne peut pas entrer/traverser un enclos (Pen). Il peut atterrir
// sur une case dinosaure (= sous attaque) mais pas la traverser — géré au déplacement.
export function pawnNeighbors(state, q, r) {
  return neighbors(q, r)
    .map((n) => tileAt(state, n.q, n.r))
    .filter(Boolean)
    .filter((t) => t.type !== TILE.RAPTOR_PEN && t.type !== TILE.SPITTER_PEN);
}
