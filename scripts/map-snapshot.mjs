#!/usr/bin/env node
/* Takes the pictures the intro card shows while the live map loads.
 *
 * The first card's window holds the whole city, and drawing the live map takes
 * a few seconds on a first visit: the map library, the tiles and the data all
 * have to arrive first. public/art/map-snapshot.webp (a laptop's window) and
 * map-snapshot-phone.webp (a phone's taller one) are that window, captured
 * from the real map, so the card can show one from the first frame and the
 * live map fades in over it once it has drawn (.story-snapshot in
 * prompt-map.css).
 *
 * Run it whenever the map's look changes (colours, pins, the first card's
 * framing), with the dev server or a preview running:
 *
 *   node scripts/map-snapshot.mjs                    # http://localhost:4321/
 *   node scripts/map-snapshot.mjs http://localhost:8787/
 *
 * Needs Google Chrome installed in the usual place on a Mac (CHROME= overrides).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.argv[2] || 'http://localhost:4321/';
const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'art');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/* A common laptop window and a common phone, both drawn at 2x so they stay
   sharp on retina screens. */
const VIEWS = [
  { file: 'map-snapshot.webp', width: 1440, height: 900, mobile: false },
  /* The tallest common phone, so the picture covers a shorter phone's window
     too: it is scaled to the window's width, and any extra height is cropped. */
  { file: 'map-snapshot-phone.webp', width: 430, height: 932, mobile: true },
];
const SCALE = 2;
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(path.join(tmpdir(), 'map-snapshot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

try {
  for (let i = 0; i < 50 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error('Chrome did not start');
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  });
  await send('Runtime.enable');
  await send('Page.enable');

  for (const v of VIEWS) {
    await send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: SCALE, mobile: v.mobile });
    await send('Page.navigate', { url: URL });
    await sleep(500);
    /* The live map, drawn, on the first card. */
    for (let i = 0; i < 120; i++) {
      if (await evaluate(`document.getElementById('frame')?.classList.contains('is-ready')`)) break;
      await sleep(250);
    }
    /* The first card frames the city with an eased move; let it settle, and
       the tiles under it finish. The snapshot itself, the loader and the
       button over the window stay out of the picture. */
    await evaluate(`(()=>{const s=document.createElement('style');s.textContent='.story-close,.story-snapshot,.story-loading{visibility:hidden!important}';document.head.append(s)})()`);
    await sleep(3500);
    const clip = await evaluate(`(()=>{const w=document.getElementById('story-window');const b=w.getBoundingClientRect();const cs=getComputedStyle(w);
      const t=parseFloat(cs.borderTopWidth),l=parseFloat(cs.borderLeftWidth),r=parseFloat(cs.borderRightWidth),bt=parseFloat(cs.borderBottomWidth);
      return {x:b.left+l,y:b.top+t,width:b.width-l-r,height:b.height-t-bt}})()`);
    if (!clip?.width) throw new Error('No story window on the page');
    const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 78, clip: { ...clip, scale: 1 } });
    const out = path.join(ART, v.file);
    writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(clip.width)}×${Math.round(clip.height)} at ${SCALE}x)`);
  }
} finally {
  ws?.close();
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold it */ }
}
