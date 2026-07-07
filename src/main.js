import { TILE } from "./board.js";
import { axialToPixel, hexCorners, key, neighbors } from "./hex.js";
import { createGame, PHASE, DINO, tileAt } from "./state.js";
import { CARD, CARD_INFO } from "./cards.js";
import {
  rollDie, dinoReachable, moveDino, pawnBasicReachable, movePawn,
  isUnderAttack, endTurn, currentPlayer,
  cardLandings, cardPlayable, discardFromHand, tradeCards, hasCancel,
} from "./game.js";

const HEX_SIZE = 42;

const SEA_COLOR = 0x2f80b5;          // océan (fond du canevas)
const LAND_GREENS = [0x4e8f3f, 0x578f42, 0x66994a, 0x3f7c38]; // variations de la jungle
const ROAD_YELLOW = 0xf7d64b;        // Tour Road
const ROAD_EDGE = 0xd9a441;          // liseré de la route
const FENCE_RED = 0xe53935;          // clôture électrique (pointillés)

// Icône dessinée au centre de certaines cases (le fond reste vert : c'est une île).
const TILE_STYLE = {
  [TILE.VISITOR_CENTER]: { fill: 0xe8b31e, label: "🏛️" },
  [TILE.SHED]:           { fill: null,     label: "🏚️" },
  [TILE.RAPTOR_PEN]:     { fill: 0x3f8a3a, label: "" },
  [TILE.SPITTER_PEN]:    { fill: 0x3f8a3a, label: "" },
  [TILE.HELIPORT]:       { fill: null,     label: "🚁", disc: 0x2f9fd0 },
  [TILE.PORT]:           { fill: null,     label: "⛴️", disc: 0x2f9fd0 },
};

const DINO_STYLE = {
  [DINO.TREX]:    { fill: 0xc0392b, emoji: "🦖" },
  [DINO.RAPTOR]:  { fill: 0x27ae60, emoji: "🦎" },
  [DINO.SPITTER]: { fill: 0xd4ac0d, emoji: "🐲" },
};

const app = new PIXI.Application();
let boardLayer, highlightLayer, tokenLayer, world;
let state;

// Contexte d'interaction (réinitialisé à chaque tour / action)
const sel = {
  dino: null, dinoReach: null,     // étape 1 (dé)
  mode: "basic",                   // étape 2 : basic | card | trade | cancel | bonus
  pawnReach: null,                 // cases du déplacement de base
  card: null,                      // { index, type, landings } pendant le ciblage
  tradeSel: null,                  // Set d'index sélectionnés (échange / bonus)
  bonusPlayer: null,               // joueur en attente de bonus trade (refuge)
};

async function init() {
  const container = document.getElementById("stage-container");
  await app.init({ background: SEA_COLOR, resizeTo: container, antialias: true });
  container.appendChild(app.canvas);
  window.addEventListener("resize", () => world && fitToScreen(container));
  showStartMenu();
}

// ---------- Menu de départ ----------
function showStartMenu() {
  const container = document.getElementById("stage-container");
  const menu = document.createElement("div");
  menu.id = "start-menu";
  menu.innerHTML = `
    <div class="menu-card">
      <h2>🦖 Jurassic Park</h2>
      <p>Fuyez les dinosaures et rejoignez le Visitor Center avant vos adversaires.</p>
      <p class="menu-q">Combien de joueurs ?</p>
      <div class="menu-btns">
        <button data-n="2">2</button>
        <button data-n="3">3</button>
        <button data-n="4">4</button>
      </div>
    </div>`;
  container.appendChild(menu);
  menu.querySelectorAll("button").forEach((b) =>
    (b.onclick = () => { menu.remove(); startGame(Number(b.dataset.n)); })
  );
  document.getElementById("status").textContent = "Choisissez le nombre de joueurs";
  document.getElementById("sidebar").innerHTML = "";
}

function startGame(playerCount) {
  state = createGame(playerCount);
  clearSelection();
  buildLayers();
  drawBoard();
  refresh();
  fitToScreen(document.getElementById("stage-container"));
}

function buildLayers() {
  if (world) world.destroy({ children: true });
  world = new PIXI.Container();
  boardLayer = new PIXI.Container();
  highlightLayer = new PIXI.Container();
  tokenLayer = new PIXI.Container();
  highlightLayer.eventMode = "none";
  tokenLayer.eventMode = "none";
  world.addChild(boardLayer, highlightLayer, tokenLayer);
  app.stage.addChild(world);
}

// ---------- Rendu statique du plateau ----------
// Ordre des couches : île verte → clôtures pointillées → Tour Road jaune → icônes.
function drawBoard() {
  drawLand();
  drawFences();
  drawRoad();
  drawIcons();
}

// Fond de l'île : chaque case est un hexagone vert (variation légère de la jungle).
function drawLand() {
  for (const tile of state.tiles.values()) {
    const { x, y } = axialToPixel(tile.q, tile.r, HEX_SIZE);
    const style = TILE_STYLE[tile.type];
    const fill = style && style.fill != null ? style.fill : landGreen(tile.q, tile.r);
    const g = new PIXI.Graphics();
    g.poly(hexCorners(x, y, HEX_SIZE - 1))
      .fill(fill)
      .stroke({ width: 1, color: 0x2f5a2a, alpha: 0.6 });
    g.eventMode = "static";
    g.cursor = "pointer";
    g.on("pointertap", () => onTileClick(tile.q, tile.r));
    boardLayer.addChild(g);
  }
}

// Vert pseudo-aléatoire mais stable pour une case (donne du relief à la jungle).
function landGreen(q, r) {
  const h = ((q * 73856093) ^ (r * 19349663)) >>> 0;
  return LAND_GREENS[h % LAND_GREENS.length];
}

// Clôture électrique : contour hexagonal rouge en pointillés autour des enclos.
function drawFences() {
  for (const tile of state.tiles.values()) {
    if (tile.type !== TILE.RAPTOR_PEN && tile.type !== TILE.SPITTER_PEN) continue;
    const { x, y } = axialToPixel(tile.q, tile.r, HEX_SIZE);
    const corners = hexCorners(x, y, HEX_SIZE - 4);
    const g = new PIXI.Graphics();
    for (let i = 0; i < 6; i++) {
      const ax = corners[i * 2], ay = corners[i * 2 + 1];
      const bx = corners[((i + 1) % 6) * 2], by = corners[((i + 1) % 6) * 2 + 1];
      dashedSegment(g, ax, ay, bx, by, 7, 5);
    }
    g.stroke({ width: 3, color: FENCE_RED });
    g.eventMode = "none";
    boardLayer.addChild(g);
  }
}

// Trace un segment en pointillés (dash/gap) dans un Graphics (à valider par g.stroke()).
function dashedSegment(g, ax, ay, bx, by, dash, gap) {
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len, uy = (by - ay) / len;
  let d = 0;
  while (d < len) {
    const d2 = Math.min(d + dash, len);
    g.moveTo(ax + ux * d, ay + uy * d).lineTo(ax + ux * d2, ay + uy * d2);
    d += dash + gap;
  }
}

// Tour Road : trait jaune épais reliant les centres des cases route adjacentes.
function drawRoad() {
  const roads = [...state.tiles.values()].filter((t) => t.type === TILE.ROAD);
  const edge = new PIXI.Graphics();
  const core = new PIXI.Graphics();
  const w = HEX_SIZE * 0.4;
  for (const t of roads) {
    const a = axialToPixel(t.q, t.r, HEX_SIZE);
    for (const n of neighbors(t.q, t.r)) {
      const other = state.tiles.get(key(n.q, n.r));
      if (!other || other.type !== TILE.ROAD) continue;
      if (n.r < t.r || (n.r === t.r && n.q < t.q)) continue; // une seule fois par paire
      const b = axialToPixel(n.q, n.r, HEX_SIZE);
      edge.moveTo(a.x, a.y).lineTo(b.x, b.y);
      core.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    // Pastille de raccord aux jonctions.
    edge.circle(a.x, a.y, (w + 5) / 2);
    core.circle(a.x, a.y, w / 2);
  }
  edge.stroke({ width: w + 5, color: ROAD_EDGE, cap: "round", join: "round" }).fill(ROAD_EDGE);
  core.stroke({ width: w, color: ROAD_YELLOW, cap: "round", join: "round" }).fill(ROAD_YELLOW);
  edge.eventMode = "none";
  core.eventMode = "none";
  boardLayer.addChild(edge, core);
}

// Icônes : bâtiments (refuges, Visitor Center), héliport/port, START.
function drawIcons() {
  for (const tile of state.tiles.values()) {
    const { x, y } = axialToPixel(tile.q, tile.r, HEX_SIZE);
    const style = TILE_STYLE[tile.type];
    if (style && style.disc) {
      const disc = new PIXI.Graphics();
      disc.circle(x, y, HEX_SIZE * 0.34).fill(style.disc).stroke({ width: 2, color: 0xffffff });
      disc.eventMode = "none";
      boardLayer.addChild(disc);
    }
    if (style && style.label) addLabel(style.label, x, y, HEX_SIZE * 0.6);
    if (tile.type === TILE.PAWN_START) addLabel("START", x, y + HEX_SIZE * 0.7, 13, true);
  }
}

// Ajoute un texte centré (emoji ou libellé) au plateau.
function addLabel(text, x, y, size, isTag = false) {
  const style = isTag
    ? { fontSize: size, fontWeight: "bold", fill: 0xffffff, stroke: { color: 0x1a1a1a, width: 3 } }
    : { fontSize: size };
  const t = new PIXI.Text({ text, style });
  t.anchor.set(0.5);
  t.position.set(x, y);
  t.eventMode = "none";
  boardLayer.addChild(t);
}

// ---------- Rendu dynamique ----------
function refresh() {
  highlightLayer.removeChildren();
  tokenLayer.removeChildren();
  drawHighlights();
  drawDinos();
  drawPawns();
  renderSidebar();
}

function drawHighlights() {
  if (state.phase === PHASE.ROLL) {
    if (sel.dino && sel.dinoReach) {
      sel.dinoReach.forEach((k) => outlineTile(k, 0xffffff, 0.9));
    } else {
      movableDinoTiles().forEach((k) => outlineTile(k, 0xff5252, 0.9));
    }
  } else if (state.phase === PHASE.ACTION) {
    if (sel.mode === "card" && sel.card) sel.card.landings.forEach((k) => outlineTile(k, 0x66d9ff, 1));
    else if (sel.mode === "basic" && sel.pawnReach) sel.pawnReach.forEach((k) => outlineTile(k, 0xffffff, 0.9));
  }
}

function outlineTile(k, color, alpha) {
  const tile = state.tiles.get(k);
  if (!tile) return;
  const { x, y } = axialToPixel(tile.q, tile.r, HEX_SIZE);
  const g = new PIXI.Graphics();
  g.poly(hexCorners(x, y, HEX_SIZE - 3)).stroke({ width: 4, color, alpha });
  highlightLayer.addChild(g);
}

function movableDinoTiles() {
  const out = new Set();
  if (!state.die) return out;
  for (const d of state.dinos) {
    if (d.type !== state.die.dino) continue;
    if (dinoReachable(state, d, state.die.steps).size > 0) out.add(key(d.q, d.r));
  }
  return out;
}

function clusterOffset(i, n) {
  if (n <= 1) return { dx: 0, dy: 0 };
  const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
  const rad = HEX_SIZE * 0.32;
  return { dx: Math.cos(angle) * rad, dy: Math.sin(angle) * rad };
}

function drawDinos() {
  for (const [k, list] of groupBy(state.dinos, (d) => key(d.q, d.r))) {
    const t = state.tiles.get(k);
    const { x, y } = axialToPixel(t.q, t.r, HEX_SIZE);
    list.forEach((d, i) => {
      const { dx, dy } = clusterOffset(i, list.length);
      const style = DINO_STYLE[d.type];
      const g = new PIXI.Graphics();
      g.circle(x + dx, y + dy, HEX_SIZE * 0.26).fill(style.fill).stroke({ width: 2, color: 0x1a1a1a });
      tokenLayer.addChild(g);
      const e = new PIXI.Text({ text: style.emoji, style: { fontSize: HEX_SIZE * 0.34 } });
      e.anchor.set(0.5);
      e.position.set(x + dx, y + dy);
      tokenLayer.addChild(e);
    });
  }
}

function drawPawns() {
  const active = state.players.filter((p) => !p.arrived);
  for (const [k, list] of groupBy(active, (p) => key(p.q, p.r))) {
    const t = state.tiles.get(k);
    const { x, y } = axialToPixel(t.q, t.r, HEX_SIZE);
    list.forEach((p, i) => {
      const { dx, dy } = clusterOffset(i, list.length);
      const isCurrent = state.players[state.current] === p;
      const g = new PIXI.Graphics();
      g.circle(x + dx, y + dy, HEX_SIZE * 0.22)
        .fill(p.hex)
        .stroke({ width: isCurrent ? 4 : 2, color: isCurrent ? 0xffffff : 0x1a1a1a });
      tokenLayer.addChild(g);
    });
  }
}

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// ---------- Interactions plateau ----------
function onTileClick(q, r) {
  if (!state || state.phase === PHASE.GAME_OVER) return;
  const k = key(q, r);
  const player = currentPlayer(state);

  if (state.phase === PHASE.ROLL) {
    if (!state.die) return;
    if (!sel.dino) {
      const d = state.dinos.find((d) => d.type === state.die.dino && d.q === q && d.r === r);
      if (d && dinoReachable(state, d, state.die.steps).size > 0) {
        sel.dino = d;
        sel.dinoReach = dinoReachable(state, d, state.die.steps);
        refresh();
      }
      return;
    }
    if (sel.dinoReach.has(k)) {
      moveDino(state, sel.dino, q, r);
      log(`${dinoName(sel.dino.type)} déplacé.`);
      sel.dino = null; sel.dinoReach = null;
      enterAction();
      refresh();
    }
    return;
  }

  if (state.phase === PHASE.ACTION) {
    if (sel.mode === "basic" && sel.pawnReach && sel.pawnReach.has(k)) {
      movePawn(state, player, q, r);
      afterPawnMove(player, `${player.name} avance`);
    } else if (sel.mode === "card" && sel.card && sel.card.landings.has(k)) {
      playCardAt(q, r);
    }
  }
}

// ---------- Étape 1 : dé ----------
function doRoll() {
  if (state.phase !== PHASE.ROLL || state.die) return;
  const face = rollDie(state);
  log(`🎲 ${currentPlayer(state).name} lance : ${dinoName(face.dino)} / ${face.steps}`);
  if (movableDinoTiles().size === 0) log(`Aucun ${dinoName(face.dino)} ne peut bouger.`);
  refresh();
}

function skipDino() {
  if (state.phase !== PHASE.ROLL || !state.die) return;
  sel.dino = null; sel.dinoReach = null;
  enterAction();
  refresh();
}

// ---------- Étape 2 : action ----------
function enterAction() {
  state.phase = PHASE.ACTION;
  sel.mode = "basic";
  sel.card = null;
  sel.tradeSel = null;
  sel.pawnReach = pawnBasicReachable(state, currentPlayer(state));
}

// Sélection d'une carte à jouer (carte de déplacement -> mode ciblage).
function selectCard(index) {
  const player = currentPlayer(state);
  const card = player.hand[index];
  if (!card || !cardPlayable(state, player, card.type)) return;
  sel.mode = "card";
  sel.card = { index, type: card.type, landings: cardLandings(state, player, card.type) };
  refresh();
}

function cancelCardSelection() {
  sel.mode = "basic";
  sel.card = null;
  refresh();
}

// Le joueur a cliqué une destination pour la carte sélectionnée.
function playCardAt(q, r) {
  const player = currentPlayer(state);
  const [card] = player.hand.splice(sel.card.index, 1);
  const dest = { q, r };
  sel.card = null;
  state.pending = { card, actorIndex: state.current, dest, cancelled: false, lastActorIndex: state.current };
  log(`${player.name} joue « ${CARD_INFO[card.type].title} ».`);
  const elig = eligibleCancellers();
  if (elig.length === 0) resolvePending();
  else { sel.mode = "cancel"; refresh(); }
}

// Joueurs (autres que le dernier acteur) détenant une carte Cancel.
function eligibleCancellers() {
  const out = [];
  state.players.forEach((p, i) => {
    if (i !== state.pending.lastActorIndex && !p.arrived && hasCancel(p)) out.push(i);
  });
  return out;
}

function doCancel(j) {
  const pl = state.players[j];
  const idx = pl.hand.findIndex((c) => c.type === CARD.CANCEL);
  if (idx < 0) return;
  discardFromHand(state, pl, idx);
  state.pending.cancelled = !state.pending.cancelled;
  state.pending.lastActorIndex = j;
  log(`${pl.name} joue Annuler 🚫`);
  if (eligibleCancellers().length === 0) resolvePending();
  else refresh();
}

function resolveNoCancel() {
  resolvePending();
}

// Résout la carte en attente : appliquée si non annulée, sinon défaussée sans effet.
function resolvePending() {
  const { card, actorIndex, dest, cancelled } = state.pending;
  const actor = state.players[actorIndex];
  state.discard.push(card);
  state.pending = null;

  if (cancelled) {
    log(`La carte est annulée : aucun effet.`);
    finishTurnAndRefresh();
    return;
  }
  movePawn(state, actor, dest.q, dest.r);
  afterPawnMove(actor, `${actor.name} se déplace`);
}

// Après tout déplacement de pion : victoire, refuge (bonus trade) ou fin de tour.
function afterPawnMove(player, msg) {
  if (state.phase === PHASE.GAME_OVER) {
    log(`🏆 ${player.name} atteint le Visitor Center et gagne !`);
    clearSelection();
    refresh();
    return;
  }
  const tile = tileAt(state, player.q, player.r);
  if (tile.type === TILE.SHED) {
    log(`${msg} dans un refuge 🏚️ (bonus : échange possible).`);
    sel.mode = "bonus";
    sel.bonusPlayer = player;
    sel.tradeSel = new Set();
    refresh();
  } else {
    log(`${msg}.`);
    finishTurnAndRefresh();
  }
}

// ---------- Échange de cartes ----------
function enterTrade() {
  sel.mode = "trade";
  sel.tradeSel = new Set();
  refresh();
}

function toggleTradeCard(index) {
  if (!sel.tradeSel) return;
  sel.tradeSel.has(index) ? sel.tradeSel.delete(index) : sel.tradeSel.add(index);
  refresh();
}

function confirmTrade() {
  const player = sel.mode === "bonus" ? sel.bonusPlayer : currentPlayer(state);
  const indices = [...sel.tradeSel];
  if (indices.length > 0) {
    tradeCards(state, player, indices);
    log(`${player.name} échange ${indices.length} carte(s).`);
  }
  finishTurnAndRefresh();
}

function cancelTrade() {
  // "Échange" = une action : l'annuler renvoie au menu d'action.
  sel.mode = "basic";
  sel.tradeSel = null;
  refresh();
}

function skipBonus() {
  finishTurnAndRefresh();
}

// ---------- Fin de tour ----------
function passAction() {
  if (state.phase !== PHASE.ACTION) return;
  log(`${currentPlayer(state).name} passe.`);
  finishTurnAndRefresh();
}

function finishTurnAndRefresh() {
  endTurn(state);
  clearSelection();
  if (state.phase !== PHASE.GAME_OVER) enterActionAtRoll();
  refresh();
}

// Le joueur suivant commence à l'étape 1 (dé) : on n'entre PAS en action tout de suite.
function enterActionAtRoll() {
  sel.mode = "basic";
  sel.pawnReach = null;
}

function clearSelection() {
  sel.dino = null; sel.dinoReach = null;
  sel.mode = "basic"; sel.pawnReach = null;
  sel.card = null; sel.tradeSel = null; sel.bonusPlayer = null;
}

// ---------- Barre latérale ----------
function renderSidebar() {
  const el = document.getElementById("sidebar");
  const p = currentPlayer(state);
  const status = document.getElementById("status");

  if (state.phase === PHASE.GAME_OVER) {
    status.textContent = `🏆 ${state.winner.name} a gagné !`;
  } else {
    const phaseLabel = state.phase === PHASE.ROLL ? "1 · Dé dinosaure" : "2 · Action";
    status.textContent = `Tour de ${p.name} — Étape ${phaseLabel}`;
  }

  const hexc = (h) => "#" + h.toString(16).padStart(6, "0");
  let html = `<div class="turn" style="border-color:${hexc(p.hex)}">
      <div class="turn-name" style="color:${hexc(p.hex)}">
        ● ${p.name}${isUnderAttack(state, p) && state.phase !== PHASE.GAME_OVER ? " ⚠️ sous attaque" : ""}
      </div>`;

  if (state.phase === PHASE.GAME_OVER) {
    html += `<p class="big">🏆 ${state.winner.name} rejoint le Visitor Center et remporte la partie !</p>
             <button class="btn primary" id="btn-restart">Nouvelle partie</button>`;
  } else if (state.phase === PHASE.ROLL) {
    html += renderRoll();
  } else if (sel.mode === "cancel") {
    html += renderCancelWindow();
  } else if (sel.mode === "trade" || sel.mode === "bonus") {
    html += renderTrade(p);
  } else {
    html += renderActionMenu(p);
  }
  html += `</div>`;

  html += renderPlayers();
  html += renderLog();
  el.innerHTML = html;

  // Liaisons
  bind("btn-roll", doRoll);
  bind("btn-skip", skipDino);
  bind("btn-pass", passAction);
  bind("btn-trade", enterTrade);
  bind("btn-cancel-sel", cancelCardSelection);
  bind("btn-trade-confirm", confirmTrade);
  bind("btn-trade-cancel", cancelTrade);
  bind("btn-bonus-skip", skipBonus);
  bind("btn-cancel-resolve", resolveNoCancel);
  bind("btn-restart", () => startGame(state.players.length));
  p.hand.forEach((_, i) => bind(`card-${i}`, () => onCardClick(i)));
  eligibleCancellersSafe().forEach((j) => bind(`cancel-by-${j}`, () => doCancel(j)));
}

function onCardClick(i) {
  if (sel.mode === "trade" || sel.mode === "bonus") toggleTradeCard(i);
  else selectCard(i);
}

function eligibleCancellersSafe() {
  return state.pending ? eligibleCancellers() : [];
}

function renderRoll() {
  if (!state.die) return `<button class="btn primary" id="btn-roll">🎲 Lancer le dé</button>`;
  let h = `<p class="die">Dé : <b>${dinoName(state.die.dino)}</b> — jusqu'à <b>${state.die.steps}</b> case(s)</p>`;
  h += sel.dino
    ? `<p class="hint">Choisis une case cible (contour blanc) pour le dino.</p>`
    : `<p class="hint">Clique un dino <b>${dinoName(state.die.dino)}</b> (contour rouge) à déplacer, ou passe cette étape.</p>`;
  h += `<button class="btn" id="btn-skip">Ne pas déplacer de dino →</button>`;
  return h;
}

function renderActionMenu(p) {
  let h = "";
  if (sel.mode === "card") {
    h += `<p class="hint">🔵 Choisis une case cible pour « ${CARD_INFO[sel.card.type].title} ».</p>
          <button class="btn" id="btn-cancel-sel">← Changer d'action</button>`;
  } else if (isUnderAttack(state, p)) {
    h += `<p class="hint">⚠️ Un dinosaure te bloque : déplace-le à l'étape 1 la prochaine fois, ou joue une carte <b>Échapper</b>.</p>`;
  } else {
    h += `<p class="hint">Clique une case blanche pour avancer d'1 case, joue une carte, échange, ou passe.</p>`;
  }
  h += renderHand(p, { context: "play" });
  h += `<div class="actions">
          <button class="btn" id="btn-trade">🔄 Échanger des cartes</button>
          <button class="btn" id="btn-pass">Passer / Fin du tour</button>
        </div>`;
  return h;
}

function renderTrade(p) {
  const who = sel.mode === "bonus" ? sel.bonusPlayer : p;
  const n = sel.tradeSel ? sel.tradeSel.size : 0;
  let h = sel.mode === "bonus"
    ? `<p class="hint">🏚️ Refuge — bonus : sélectionne jusqu'à 4 cartes à échanger, puis confirme.</p>`
    : `<p class="hint">🔄 Sélectionne les cartes à échanger (jusqu'à 4), puis confirme.</p>`;
  h += renderHand(who, { context: "trade" });
  h += `<div class="actions">
          <button class="btn primary" id="btn-trade-confirm">Échanger ${n} carte(s)</button>`;
  h += sel.mode === "bonus"
    ? `<button class="btn" id="btn-bonus-skip">Passer le bonus</button>`
    : `<button class="btn" id="btn-trade-cancel">← Annuler</button>`;
  h += `</div>`;
  return h;
}

function renderCancelWindow() {
  const info = CARD_INFO[state.pending.card.type];
  let h = `<p class="hint">🚫 <b>Fenêtre d'annulation</b><br>Carte en jeu : « ${info.title} »
           ${state.pending.cancelled ? "<br><b>(actuellement annulée)</b>" : ""}</p>`;
  const elig = eligibleCancellers();
  for (const j of elig) {
    const pl = state.players[j];
    h += `<button class="btn" id="cancel-by-${j}">${pl.name} : jouer Annuler 🚫</button>`;
  }
  h += `<button class="btn primary" id="btn-cancel-resolve">Personne n'annule → résoudre</button>`;
  return h;
}

// Affichage de la main. context "play" : jouables cliquables ; context "trade" : sélection.
function renderHand(player, { context }) {
  if (player.hand.length === 0) return `<div class="hand-empty">Main vide</div>`;
  let h = `<div class="hand">`;
  player.hand.forEach((c, i) => {
    const info = CARD_INFO[c.type];
    let cls = "card";
    let attr = "";
    if (context === "play") {
      const playable = cardPlayable(state, player, c.type);
      cls += playable ? " playable" : " disabled";
      if (sel.mode === "card" && sel.card && sel.card.index === i) cls += " active";
    } else {
      if (sel.tradeSel && sel.tradeSel.has(i)) cls += " selected";
    }
    h += `<div class="${cls}" id="card-${i}"${attr}>
            <span class="card-emoji">${info.emoji}</span>
            <span class="card-title">${info.title}</span>
            <span class="card-sub">${info.short}</span>
          </div>`;
  });
  h += `</div>`;
  return h;
}

function renderPlayers() {
  const hexc = (h) => "#" + h.toString(16).padStart(6, "0");
  let h = `<div class="players">`;
  state.players.forEach((pl, i) => {
    h += `<div class="prow ${i === state.current && state.phase !== PHASE.GAME_OVER ? "cur" : ""}">
      <span class="dot" style="background:${hexc(pl.hex)}"></span>
      ${pl.name} <span class="cardcount">🂠${pl.hand.length}</span> ${pl.arrived ? "🏁" : ""}
    </div>`;
  });
  h += `</div>`;
  return h;
}

function renderLog() {
  let h = `<div class="log"><h3>Journal</h3>`;
  state.log.slice(-9).reverse().forEach((line) => (h += `<div class="logline">${line}</div>`));
  h += `</div>`;
  return h;
}

function bind(id, fn) {
  const b = document.getElementById(id);
  if (b) b.onclick = fn;
}

function log(msg) { state.log.push(msg); }

function dinoName(type) {
  return { [DINO.TREX]: "T-Rex 🦖", [DINO.RAPTOR]: "Raptor 🦎", [DINO.SPITTER]: "Spitter 🐲" }[type];
}

// ---------- Mise à l'échelle ----------
function fitToScreen(container) {
  world.scale.set(1);
  world.position.set(0, 0);
  const bounds = world.getLocalBounds();
  const pad = 40;
  const scale = Math.min(
    (container.clientWidth - pad) / bounds.width,
    (container.clientHeight - pad) / bounds.height
  );
  world.scale.set(scale);
  world.position.set(
    (container.clientWidth - bounds.width * scale) / 2 - bounds.x * scale,
    (container.clientHeight - bounds.height * scale) / 2 - bounds.y * scale
  );
}

// Interface de test/débogage (pilotage headless du jeu).
window.JP = {
  click: (q, r) => onTileClick(q, r),
  roll: doRoll,
  skip: skipDino,
  pass: passAction,
  start: (n) => startGame(n),
  state: () => state,
  sel: () => sel,
};

init();
