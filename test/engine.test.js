// Simulationstest der Spiel-Engine: node test/engine.test.js
// Zieht den <script id="engine">-Block aus index.html und spielt tausende Bot-Partien.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
assert(m, 'Engine-Block nicht gefunden');
new Function(m[1])();
const E = globalThis.Engine;

function checkInvariants(G) {
  const ids = [];
  for (const p of G.players) for (const c of p.hand) ids.push(c.id);
  for (const c of G.draw) ids.push(c.id);
  for (const c of G.discard) ids.push(c.id);
  assert.strictEqual(ids.length, 108, 'Kartenanzahl ' + ids.length);
  assert.strictEqual(new Set(ids).size, 108, 'doppelte Karten');
  assert(G.turn >= 0 && G.turn < G.players.length, 'turn ausserhalb');
  assert(E.COLORS.includes(G.color), 'ungueltige Farbe ' + G.color);
  if (!G.settings.stack) assert.strictEqual(G.pending, 0, 'pending ohne Stapelregel');
}

assert.strictEqual(E.createDeck().length, 108);

let games = 0, actions = 0, maxLen = 0, stacked = 0, unfinished = 0;
for (let n = 2; n <= 4; n++) {
  for (const stack of [true, false]) {
    for (let g = 0; g < 1500; g++) {
      const G = E.newGame('TEST');
      G.settings.stack = stack;
      for (let i = 0; i < n; i++) E.addPlayer(G, 'b' + i, 'Bot ' + i, true);
      E.startRound(G);
      assert(/^\d$/.test(G.discard[0].v), 'Startkarte keine Zahl');
      for (const p of G.players) assert.strictEqual(p.hand.length, 7);
      checkInvariants(G);
      let steps = 0;
      while (G.phase === 'playing' && steps < 5000) {
        const i = G.turn;
        // Falscher Spieler darf nichts tun
        const other = (i + 1) % n;
        assert.strictEqual(E.draw(G, other).ok, false);
        if (G.players[other].hand.length) assert.strictEqual(E.play(G, other, G.players[other].hand[0].id, 'k').ok, false);
        // Unpassende Karte wird abgelehnt
        const bad = G.players[i].hand.find(c => !E.canPlay(G, i, c));
        if (bad) {
          const before = G.players[i].hand.length;
          assert.strictEqual(E.play(G, i, bad.id, 'k').ok, false);
          assert.strictEqual(G.players[i].hand.length, before);
        }
        // Joker ohne Farbe wird abgelehnt
        const wild = G.players[i].hand.find(c => c.c === 'w' && E.canPlay(G, i, c));
        if (wild) assert.strictEqual(E.play(G, i, wild.id, undefined).ok, false);

        if (G.pending > 2) stacked++;
        const a = E.botAction(G, i);
        const r = E.apply(G, i, a);
        assert(r.ok, 'Bot-Aktion abgelehnt: ' + JSON.stringify(a) + ' ' + r.err);
        checkInvariants(G);
        steps++;
      }
      if (G.phase !== 'over') { unfinished++; continue; }
      assert.strictEqual(G.players[G.winner].hand.length, 0);
      assert.strictEqual(G.players[G.winner].wins, 1);
      // Sichtschutz: view() verraet keine fremden Karten
      const v = E.view(G, 0);
      assert(!JSON.stringify(v.players).includes('"hand"'));
      games++; actions += steps; maxLen = Math.max(maxLen, steps);
    }
  }
}

// Gezielte Regeltests
(function rules() {
  const mk = (stack, n) => {
    const G = E.newGame('T'); G.settings.stack = stack;
    for (let i = 0; i < n; i++) E.addPlayer(G, 'b' + i, 'P' + i, true);
    E.startRound(G); G.turn = 0; G.dir = 1;
    return G;
  };
  const give = (G, pi, c, v) => {           // Karte aus Stapel/anderen Haenden in die Hand von pi holen
    for (const src of [G.draw, ...G.players.map(p => p.hand)]) {
      if (src === G.players[pi].hand) continue;
      const k = src.findIndex(x => x.c === c && x.v === v);
      if (k >= 0) { const card = src.splice(k, 1)[0]; G.players[pi].hand.push(card); return card; }
    }
    return G.players[pi].hand.find(x => x.c === c && x.v === v);
  };
  const strip = (G, pi, pred) => {          // bestimmte Karten aus einer Hand zurueck in den Stapel
    const h = G.players[pi].hand;
    for (let k = h.length - 1; k >= 0; k--) if (pred(h[k])) G.draw.unshift(h.splice(k, 1)[0]);
  };
  const isDraw = c => c.v === 'd2' || c.v === 'd4';

  // +2 ohne Stapeln: Naechster zieht 2 und setzt aus
  let G = mk(false, 3); G.color = 'k';
  let c = give(G, 0, 'k', 'd2'); let before = G.players[1].hand.length;
  assert(E.play(G, 0, c.id).ok);
  assert.strictEqual(G.players[1].hand.length, before + 2);
  assert.strictEqual(G.turn, 2); assert.strictEqual(G.pending, 0);

  // Stapeln: +2 auf +2, dann muss der Dritte 4 ziehen
  G = mk(true, 3); G.color = 'k';
  c = give(G, 0, 'k', 'd2'); const c2 = give(G, 1, 'p', 'd2');
  strip(G, 2, isDraw); strip(G, 1, x => isDraw(x) && x !== c2);
  assert(E.play(G, 0, c.id).ok);
  assert.strictEqual(G.turn, 1); assert.strictEqual(G.pending, 2);
  const normal = G.players[1].hand.find(x => !isDraw(x));
  assert.strictEqual(E.play(G, 1, normal.id, 'k').ok, false, 'bei offenem Stapel nur Ziehkarten');
  before = G.players[2].hand.length;
  assert(E.play(G, 1, c2.id).ok);
  assert.strictEqual(G.players[2].hand.length, before + 4);
  assert.strictEqual(G.turn, 0); assert.strictEqual(G.pending, 0);

  // Stapeln: +2 auf +4 ist nicht erlaubt, freiwillig ziehen geht
  G = mk(true, 3); G.color = 'k';
  c = give(G, 0, 'w', 'd4'); strip(G, 1, isDraw); const d2 = give(G, 1, 'f', 'd2'); const d4 = give(G, 1, 'w', 'd4');
  assert(E.play(G, 0, c.id, 'f').ok);
  assert.strictEqual(G.turn, 1); assert.strictEqual(G.pending, 4);
  assert.strictEqual(E.play(G, 1, d2.id).ok, false, '+2 auf +4');
  assert(E.canPlay(G, 1, d4));
  before = G.players[1].hand.length;
  assert(E.draw(G, 1).ok);
  assert.strictEqual(G.players[1].hand.length, before + 4);
  assert.strictEqual(G.turn, 2);

  // Aussetzen & Richtungswechsel
  G = mk(true, 4); G.color = 'k';
  c = give(G, 0, 'k', 'skip'); assert(E.play(G, 0, c.id).ok); assert.strictEqual(G.turn, 2);
  G = mk(true, 4); G.color = 'k';
  c = give(G, 0, 'k', 'rev'); assert(E.play(G, 0, c.id).ok); assert.strictEqual(G.turn, 3); assert.strictEqual(G.dir, -1);
  G = mk(true, 2); G.color = 'k';
  c = give(G, 0, 'k', 'rev'); assert(E.play(G, 0, c.id).ok); assert.strictEqual(G.turn, 0, 'zu zweit: nochmal dran');
  G = mk(true, 2); G.color = 'k';
  c = give(G, 0, 'k', 'skip'); assert(E.play(G, 0, c.id).ok); assert.strictEqual(G.turn, 0);

  // Joker setzt die Farbe
  G = mk(true, 3); G.color = 'k';
  c = give(G, 0, 'w', 'wild'); assert(E.play(G, 0, c.id, 'p').ok); assert.strictEqual(G.color, 'p'); assert.strictEqual(G.turn, 1);

  // Ziehen: passende Karte darf gelegt oder weitergegeben werden, sonst nichts
  G = mk(true, 3); G.color = 'k';
  G.players[0].hand = G.players[0].hand.filter(x => { if (x.c === 'k' || x.c === 'w' || x.v === G.discard[0].v) { G.draw.unshift(x); return false; } return true; });
  const kIdx = G.draw.findIndex(x => x.c === 'k' && /^\d$/.test(x.v));
  G.draw.push(G.draw.splice(kIdx, 1)[0]);
  assert.strictEqual(E.pass(G, 0).ok, false, 'weitergeben ohne ziehen');
  assert(E.draw(G, 0).ok);
  assert.strictEqual(G.turn, 0); assert.notStrictEqual(G.drewCard, null);
  assert.strictEqual(E.draw(G, 0).ok, false, 'zweimal ziehen');
  assert(E.pass(G, 0).ok); assert.strictEqual(G.turn, 1);
})();

console.log('OK  Partien: ' + games + '  Aktionen: ' + actions + '  laengste Partie: ' + maxLen +
  '  Zuege mit gestapelten Ziehkarten: ' + stacked + '  nicht beendet (>5000 Zuege): ' + unfinished);
assert.strictEqual(unfinished, 0);
