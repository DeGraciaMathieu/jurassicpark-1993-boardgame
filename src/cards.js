// Les 46 cartes du jeu et la gestion du paquet (pioche / défausse).
// Types de cartes (identiques à la boîte originale) :
//   ESCAPE   — fuir un dinosaure : si tu es sur une case avec un dino, avance 1 case.
//   MOVE2    — avance ton pion de 2 cases (impossible si tu es sur une case avec un dino).
//   ROAD23   — avance de 2 ou 3 cases UNIQUEMENT sur la route (sur/à côté d'une route).
//   CANCEL   — annule une carte qui vient d'être jouée (jouable au tour de n'importe qui).

export const CARD = {
  ESCAPE: "escape",
  MOVE2: "move2",
  ROAD23: "road23",
  CANCEL: "cancel",
};

export const CARD_INFO = {
  [CARD.ESCAPE]: { title: "Échapper à un dino", short: "Fuir · 1 case", emoji: "🏃" },
  [CARD.MOVE2]:  { title: "Avancer de 2", short: "2 cases", emoji: "2️⃣" },
  [CARD.ROAD23]: { title: "Route : 2 ou 3", short: "2-3 sur route", emoji: "🛣️" },
  [CARD.CANCEL]: { title: "Annuler une carte", short: "Annulation", emoji: "🚫" },
};

// Répartition des 46 cartes.
const DISTRIBUTION = [
  [CARD.ESCAPE, 14],
  [CARD.MOVE2, 14],
  [CARD.ROAD23, 8],
  [CARD.CANCEL, 10],
];

// Construit un paquet mélangé de 46 cartes ({ id, type }).
export function buildDeck() {
  const deck = [];
  let id = 0;
  for (const [type, n] of DISTRIBUTION) {
    for (let i = 0; i < n; i++) deck.push({ id: id++, type });
  }
  return shuffle(deck);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
