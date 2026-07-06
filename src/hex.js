// Utilitaires de géométrie hexagonale (hexagones "pointy-top", coordonnées axiales q,r).
// Le plateau est décrit dans board.js via une grille décalée "odd-r" (lignes/colonnes),
// plus facile à écrire à la main. On convertit ici vers l'axial pour le rendu et l'adjacence.

// Convertit une case décalée odd-r (row, col) en coordonnées axiales (q, r).
export function offsetToAxial(row, col) {
  const q = col - ((row - (row & 1)) >> 1);
  return { q, r: row };
}

// Clé unique d'une case axiale, pour l'indexation dans une Map.
export function key(q, r) {
  return `${q},${r}`;
}

// Position pixel du centre d'un hexagone pointy-top, pour une taille (rayon) donnée.
export function axialToPixel(q, r, size) {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

// Les 6 directions voisines en axial (pointy-top).
const DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

// Liste des 6 voisins axiaux d'une case.
export function neighbors(q, r) {
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

// Les 6 sommets d'un hexagone pointy-top centré en (cx, cy).
export function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    pts.push(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
  }
  return pts;
}
