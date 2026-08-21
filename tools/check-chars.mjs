/* キャラクターの 見た目を 機械で しらべる。
 *
 * 目で 200体を ぜんぶ 見ると かならず 見おとす。
 * じっさい「カンガルーの みみが 切れている」のは 目視では 通してしまい、
 * この検査を 作ってはじめて ほかに 9体 切れているのが わかった。
 * だから キャラを 足したり 形を いじったら、かならず これを かける。
 *
 * つかいかた:
 *   node tools/check-chars.mjs [しらべる HTML のパス]      （なければ index.html）
 *
 * しらべる HTML には つぎが いる:
 *   buildRoster() … キャラの 配列を かえす
 *   drawGen(g,S,rc) … 1体を えがく
 *
 * しらべること:
 *   ① JSエラーが 0件か
 *   ② わくから はみ出していないか（つの・みみ・あし・しっぽの 切れ）
 *   ③ わくに 小さすぎないか（ぽつんと して 見える）
 *   ④ まん中から ずれすぎていないか（ならべたとき 目立つ）
 *   ⑤ 名前と ID が かぶっていないか
 *
 * 直しかた: からだの 形を いじると おなじ型を つかう別の子まで くずれる。
 *           1体ごとの ずらし（dx/dy）と 大きさ（sc）で 合わせること。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'path';

const MIN_BIG = 0.55;   // わくに たいして これより 小さいと ぽつんと 見える
const MAX_OFF = 0.10;   // まん中からの ずれの ゆるせる はば

const target = resolve(process.argv[2] || 'index.html');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('file://' + target);
await pg.waitForTimeout(600);

const rep = await pg.evaluate(({ MIN_BIG, MAX_OFF }) => {
  if (typeof buildRoster !== 'function' || typeof drawGen !== 'function')
    return { err: 'buildRoster() か drawGen() が 見つからない' };
  const S = 300;                      // 大きめに えがいて 1ピクセル単位で しらべる
  const over = [], small = [], off = [], dupName = [], dupId = [];
  const names = new Set(), ids = new Set();
  const R = buildRoster();
  for (const o of R) {
    if (names.has(o.name)) dupName.push(o.name); names.add(o.name);
    if (ids.has(o.id))     dupId.push(o.id);     ids.add(o.id);

    const t = document.createElement('canvas'); t.width = S; t.height = S;
    const g = t.getContext('2d');
    drawGen(g, S, o);                 // キラキラは わくの外に 出てよいので えがかない
    const d = g.getImageData(0, 0, S, S).data;
    const on = (x, y) => d[(y * S + x) * 4 + 3] > 24;

    let edge = 0;
    for (let i = 0; i < S; i++) {
      if (on(i, 0)) edge++;
      if (on(i, S - 1)) edge++;
      if (on(0, i)) edge++;
      if (on(S - 1, i)) edge++;
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (on(x, y)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (edge > 0) over.push(o.name + '(' + edge + 'px)');
    if (x1 < 0) { small.push(o.name + '(まっしろ)'); continue; }
    const big = Math.max(x1 - x0, y1 - y0) / S;
    if (big < MIN_BIG) small.push(o.name + '(' + big.toFixed(2) + ')');
    const cx = (x0 + x1) / 2 / S - 0.5, cy = (y0 + y1) / 2 / S - 0.5;
    if (Math.abs(cx) > MAX_OFF || Math.abs(cy) > MAX_OFF)
      off.push(o.name + '(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ')');
  }
  return { n: R.length, over, small, off, dupName, dupId };
}, { MIN_BIG, MAX_OFF });
await b.close();

if (rep.err) { console.error('✗', rep.err); process.exit(1); }

const line = (label, arr) =>
  console.log(('  ' + label).padEnd(16),
    arr.length ? '✗ ' + arr.length + '件  ' + arr.join(' ') : 'なし ✅');

console.log('キャラ数:', rep.n);
line('JSエラー',   errs.slice(0, 5));
line('はみ出し',   rep.over);
line('小さすぎ',   rep.small);
line('中心ずれ',   rep.off);
line('名前かぶり', rep.dupName);
line('IDかぶり',   rep.dupId);

// 中心ずれは 形によっては しかたないので、止めるのは 残りだけ
const ng = errs.length + rep.over.length + rep.small.length + rep.dupName.length + rep.dupId.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
