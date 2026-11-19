// Liest die Bilder (Assets/Pictures oder .../karten) und Töne (Assets/Sound oder .../toene) ein
// und schreibt Assets/manifest.js. Gross-/Kleinschreibung der Ordner wird so übernommen, wie sie auf der Platte steht.
// Aufruf:  node tools/assets.js   (oder Doppelklick auf assets-aktualisieren.bat)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sub = (dir, re) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => re.test(n) && fs.statSync(path.join(dir, n)).isDirectory()) : [];
const A_NAME = sub(ROOT, /^assets$/i)[0] || 'Assets';
const A_DIR = path.join(ROOT, A_NAME);
const DIRS_K = sub(A_DIR, /^(karten|pictures|pics|bilder|images)$/i);
const DIRS_T = sub(A_DIR, /^(toene|töne|sound|sounds|audio)$/i);
const OUT = path.join(A_DIR, 'manifest.js');

const IMG = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'];
const SND = ['.mp3', '.ogg', '.wav', '.m4a', '.webm'];
const FARBEN = ['koralle', 'bernstein', 'petrol', 'flieder'];
const WERTE = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'aussetzen', 'richtungswechsel', 'plus2'];
const JOKER = ['joker', 'plus4'];
const SYNONYM = { skip: 'aussetzen', stopp: 'aussetzen', stop: 'aussetzen', richtung: 'richtungswechsel', reverse: 'richtungswechsel',
  wechsel: 'richtungswechsel', aussetzten: 'aussetzen', ausetzen: 'aussetzen', '+2': 'plus2', 'zieh2': 'plus2', '+4': 'plus4', 'zieh4': 'plus4', 'joker-plus4': 'plus4', 'joker+4': 'plus4',
  wild: 'joker', 'rückseite': 'rueckseite', back: 'rueckseite', alle: 'alle' };
const SONDER_TON = ['dran', 'gewonnen', 'ziehen', 'strafe'];   // alles andere landet im Zufalls-Topf "legen"
// Bilder für Spielsituationen (Erkennung über Namensbestandteile)
const SONDER_BILD = [
  ['boep', /hatb(oe|ö)[bp]|letztekarte|^b(oe|ö)p$/, 'zittert bei dem, der nur noch eine Karte hat'],
  ['dochziehen', /einekarteleft|dochziehen/, 'eine Karte übrig und muss ziehen'],
  ['verlierer', /verlierer|verloren/, 'Rundenende, für alle außer dem Gewinner']
];

const KARTEN_KEYS = new Set(['alle', ...FARBEN, ...WERTE, ...JOKER]);
for (const f of FARBEN) for (const w of WERTE) KARTEN_KEYS.add(f + '-' + w);

// "Koralle 7_2.PNG" -> "koralle-7"   (alles nach "_" ist nur eine Varianten-Kennung)
function keyOf(file) {
  let base = path.basename(file, path.extname(file)).toLowerCase().trim();
  base = base.split('_')[0].trim().replace(/\s+/g, '-');
  base = base.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  if (SYNONYM[base]) return SYNONYM[base];
  const m = base.match(/^([a-z]+)-(.+)$/);
  if (m && FARBEN.includes(m[1]) && SYNONYM[m[2]]) return m[1] + '-' + SYNONYM[m[2]];
  return base;
}
// alle passenden Dateien aus den gefundenen Unterordnern, als [ordnername, dateiname]
const list = (dirs, exts) => [].concat(...dirs.map(d => fs.readdirSync(path.join(A_DIR, d))
  .filter(f => exts.includes(path.extname(f).toLowerCase())).sort((a, b) => a.localeCompare(b, 'de', { numeric: true })).map(f => [d, f])));
const url = (d, f) => A_NAME + '/' + encodeURIComponent(d) + '/' + encodeURIComponent(f);
const add = (obj, k, v) => { (obj[k] = obj[k] || []).push(v); };

const out = { karten: {}, rueckseite: '', bilder: {}, toene: { legen: [], karte: {} } };
const zuordnung = [];
const warn = [];
let bytes = 0;
const size = (dir, f, limit) => {
  const s = fs.statSync(path.join(A_DIR, dir, f)).size; bytes += s;
  if (s > limit) warn.push(f + ' ist ' + (s / 1048576).toFixed(1) + ' MB groß – lädt bei Mitspielern langsam.');
};

for (const [d, f] of list(DIRS_K, IMG)) {
  const k = keyOf(f);
  const flach = path.basename(f, path.extname(f)).toLowerCase().replace(/[\s_-]+/g, '');
  size(d, f, 600 * 1024);
  const sonder = SONDER_BILD.find(x => x[1].test(flach));
  if (sonder) { out.bilder[sonder[0]] = url(d, f); zuordnung.push([f, sonder[2]]); }
  else if (k === 'rueckseite') { out.rueckseite = url(d, f); zuordnung.push([f, 'Kartenrückseite']); }
  else if (KARTEN_KEYS.has(k)) { add(out.karten, k, url(d, f)); zuordnung.push([f, 'Kartenmotiv: ' + k]); }
  else warn.push('Bild "' + f + '": Name passt zu nichts und wird ignoriert (siehe LIESMICH.txt).');
}
for (const [d, f] of list(DIRS_T, SND)) {
  const k = keyOf(f);
  size(d, f, 1500 * 1024);
  const sonder = SONDER_TON.find(s => k === s || k.startsWith(s + '-'));
  if (sonder) add(out.toene, sonder, url(d, f));
  else if (KARTEN_KEYS.has(k) && k !== 'alle') add(out.toene.karte, k, url(d, f));
  else out.toene.legen.push(url(d, f));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '// Automatisch erzeugt von tools/assets.js – nicht von Hand bearbeiten.\nwindow.BOEP_ASSETS = ' + JSON.stringify(out, null, 2) + ';\n');

// ---- Übersicht ----
const imgFor = (keys) => keys.find(k => out.karten[k]);
let mit = 0; const ohne = [];
for (const f of FARBEN) for (const w of WERTE) { if (imgFor([f + '-' + w, w, f, 'alle'])) mit++; else ohne.push(f + '-' + w); }
for (const j of JOKER) { if (imgFor([j, 'alle'])) mit++; else ohne.push(j); }
const nImg = Object.values(out.karten).reduce((n, l) => n + l.length, 0);
console.log('Böp! – Bilder & Töne   (Ordner: ' + A_NAME + '/' + (DIRS_K.join(',') || '–') + ' und ' + A_NAME + '/' + (DIRS_T.join(',') || '–') + ')');
for (const [f, was] of zuordnung) console.log('  ' + f.padEnd(40) + ' → ' + was);
console.log('  Kartenbilder:      ' + nImg + ' Datei(en) → ' + mit + ' von 54 Kartenmotiven haben ein Bild');
if (nImg && ohne.length) console.log('  Noch ohne Bild:    ' + (ohne.length > 14 ? ohne.slice(0, 14).join(', ') + ' … (+' + (ohne.length - 14) + ')' : ohne.join(', ')));
console.log('  Rückseite:         ' + (out.rueckseite ? 'eigenes Bild' : 'Standard'));
console.log('  Töne beim Legen:   ' + out.toene.legen.length + ' zufällige' +
  (Object.keys(out.toene.karte).length ? ' + feste für: ' + Object.keys(out.toene.karte).join(', ') : ''));
for (const s of SONDER_TON) console.log(('  Ton "' + s + '":').padEnd(21) + (out.toene[s] ? out.toene[s].length + ' Datei(en)' : 'Standard-Ton'));
console.log('  Gesamtgröße:       ' + (bytes / 1048576).toFixed(1) + ' MB');
for (const w of warn) console.log('  ! ' + w);
console.log('Geschrieben: ' + A_NAME + '/manifest.js');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!html.includes('src="' + A_NAME + '/manifest.js"'))
  console.log('  ! ACHTUNG: index.html lädt nicht "' + A_NAME + '/manifest.js" – der Ordnername (Gross-/Kleinschreibung) muss übereinstimmen, sonst fehlen online Bilder und Töne.');
