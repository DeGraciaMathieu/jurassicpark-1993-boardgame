// Définition de la carte de l'île, reconstruite fidèlement d'après la carte du plateau
// original (Milton Bradley, 1992). La grille est écrite à la main en décalé "odd-r" :
// chaque caractère = une case, chaque ligne = une rangée d'hexagones.
//
//   '.' océan (hors plateau)   'L' terre (case normale)   'R' route
//   'V' Visitor Center (arrivée)   'M' Maintenance Shed (refuge)
//   'A' enclos à raptors   'S' enclos à spitters
//   'T' départ T-Rex   'P' départ des joueurs

import { offsetToAxial, key } from "./hex.js";

export const TILE = {
  LAND: "land",
  ROAD: "road",
  VISITOR_CENTER: "visitor",
  SHED: "shed",
  RAPTOR_PEN: "raptorPen",
  SPITTER_PEN: "spitterPen",
  TREX_START: "trexStart",
  PAWN_START: "pawnStart",
};

const CHAR_TO_TILE = {
  L: TILE.LAND,
  R: TILE.ROAD,
  V: TILE.VISITOR_CENTER,
  M: TILE.SHED,
  A: TILE.RAPTOR_PEN,
  S: TILE.SPITTER_PEN,
  T: TILE.TREX_START,
  P: TILE.PAWN_START,
};

// Représentation ASCII de l'île (nord en haut, sud en bas).
const MAP = [
  "...........",
  "....LLL....",
  "...LMLLL...",
  "..LLLVLL...",
  "..LLRRLLL..",
  "..LARLMLL..",
  "..LLRRLLL..",
  "..LMRLSLL..",
  "..LLRLLML..",
  "..LARLLLL..",
  "..LLRRLSL..",
  "...LMRLLL..",
  "..LLRLSLL..",
  "..LLRLALM..",
  "...LRRLLL..",
  "...LPTLL...",
  "....LLL....",
];

// Construit la table des cases : Map indexée par "q,r".
// Chaque case = { q, r, row, col, type }.
export function buildBoard() {
  const tiles = new Map();
  for (let row = 0; row < MAP.length; row++) {
    const line = MAP[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      const type = CHAR_TO_TILE[ch];
      if (!type) continue; // océan
      const { q, r } = offsetToAxial(row, col);
      tiles.set(key(q, r), { q, r, row, col, type });
    }
  }
  return tiles;
}

// Retrouve l'unique case d'un type donné (Visitor Center, départs…).
export function findTile(tiles, type) {
  for (const t of tiles.values()) if (t.type === type) return t;
  return null;
}
