// Store screenshots: raw 1080×2400 emulator captures → framed, captioned PNGs
// for the App Store (6.9", 1320×2868) and Google Play (9:16, 1440×2560).
import { chromium } from '/home/yunus/Work/zuhd.news/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const S = path.dirname(new URL(import.meta.url).pathname);
const RAW = path.join(S, 'raw');
const OUT = process.argv[2];
const FONTS = '/home/yunus/Work/zuhd.news/mobile/assets/fonts';
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, f)).toString('base64')}`;

const SCREENS = [
  { file: '01-map.png', kicker: 'The map', head: 'The day’s news, where it happened', theme: 'dark' },
  { file: '02-story-ukraine.png', kicker: 'The story', head: 'What happened, why it matters, what’s next', theme: 'dark' },
  { file: '03-hormuz.png', kicker: 'Markets & shipping', head: 'Every move, with the reason for it', theme: 'dark' },
  { file: '04-menu.png', kicker: 'The numbers', head: 'Markets, rates and odds in plain words', theme: 'dark' },
  { file: '05-hazards.png', kicker: 'World hazards', head: 'Conflict, famine and disasters, from the source', theme: 'dark' },
  { file: '06-country.png', kicker: 'Countries', head: 'Every country, by the numbers', theme: 'dark' },
  { file: '07-light-gates.png', kicker: 'No account', head: 'Nothing to sign up for. Just the news.', theme: 'light' },
];

const SIZES = [
  { dir: 'app-store-6.9in', w: 1320, h: 2868 },
  { dir: 'google-play-phone', w: 1440, h: 2560 },
];

const THEMES = {
  dark: { bg: '#0F0F11', glow: 'rgba(51,68,85,0.55)', head: '#FAFAFA', kicker: '#c9a84c', status: '#FAFAFA', rim: '#3a3a3e', body: '#050506', shadow: 'rgba(0,0,0,0)' },
  light: { bg: '#f5f2ed', glow: 'rgba(127,157,196,0.22)', head: '#1a1a1a', kicker: '#7a5e1a', status: '#1a1a1a', rim: '#bdb8b0', body: '#1a1a1c', shadow: 'rgba(60,50,30,0.22)' },
};

const STATUS_H = 118; // Android status bar in the 1080×2400 capture, in capture pixels

function html({ w, h }, s, img) {
  const t = THEMES[s.theme];
  // Caption band, then the phone as large as the rest of the canvas allows.
  const pad = Math.round(w * 0.075);
  const captionTop = Math.round(h * 0.052);
  const kickerPx = Math.round(w * 0.03);
  const headPx = Math.round(w * 0.068);
  const bandH = Math.round(h * (h / w > 2 ? 0.2 : 0.215));
  const bezel = Math.round(w * 0.018);
  const devH = h - bandH - Math.round(h * 0.035);
  const screenH = devH - 2 * bezel;
  const screenW = Math.round((screenH * 1080) / 2400);
  const devW = screenW + 2 * bezel;
  const radius = Math.round(devW * 0.13);
  const sRadius = radius - bezel;
  const k = screenW / 1080; // capture px → canvas px
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:S3;src:url(${font('SourceSans3-SemiBold.ttf')});font-weight:600}
@font-face{font-family:S3;src:url(${font('SourceSans3-Bold.ttf')});font-weight:700}
@font-face{font-family:S3SC;src:url(${font('SourceSans3SC-SemiBold.ttf')})}
*{margin:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:radial-gradient(ellipse ${w * 0.9}px ${h * 0.45}px at 50% ${bandH + devH * 0.35}px, ${t.glow}, transparent 70%), ${t.bg};font-family:S3;position:relative}
.cap{position:absolute;left:${pad}px;right:${pad}px;top:${captionTop}px;text-align:center}
.kicker{font-family:S3SC;color:${t.kicker};font-size:${kickerPx}px;letter-spacing:.14em;text-transform:lowercase;margin-bottom:${Math.round(kickerPx * 0.55)}px}
.head{color:${t.head};font-weight:700;font-size:${headPx}px;line-height:1.08;letter-spacing:-.012em;text-wrap:balance}
.dev{position:absolute;left:${(w - devW) / 2}px;top:${bandH}px;width:${devW}px;height:${devH}px;border-radius:${radius}px;background:${t.body};
  box-shadow:0 0 0 ${Math.max(2, Math.round(w * 0.0022))}px ${t.rim}, 0 ${h * 0.02}px ${h * 0.05}px ${t.shadow};padding:${bezel}px}
canvas{display:block;width:${screenW}px;height:${screenH}px;border-radius:${sRadius}px}
</style></head><body>
<div class="cap"><div class="kicker">${s.kicker}</div><div class="head">${s.head}</div></div>
<div class="dev"><canvas id="c" width="1080" height="2400"></canvas></div>
<script>
const im = new Image();
im.onload = async () => {
  await document.fonts.load('600 44px S3'); await document.fonts.ready;
  const c = document.getElementById('c'), x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  // Replace the Android status bar (punch-hole, system icons) with a neutral one.
  // Each row takes its own median colour, so the app's header shade (a vertical
  // gradient) carries on into the bar with no seam where the capture resumes.
  const d = x.getImageData(0, 0, 1080, ${STATUS_H}).data;
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  for (let y = 0; y < ${STATUS_H}; y++) {
    const rs = [], gs = [], bs = [];
    for (let i = y * 4320; i < (y + 1) * 4320; i += 4) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
    x.fillStyle = 'rgb(' + med(rs) + ',' + med(gs) + ',' + med(bs) + ')';
    x.fillRect(0, y, 1080, 1);
  }
  x.fillStyle = '${t.status}'; x.strokeStyle = '${t.status}';
  x.font = '600 44px S3'; x.textBaseline = 'middle';
  x.fillText('9:41', 92, 62);
  // signal bars
  for (let i = 0; i < 4; i++) { const bh = 12 + i * 7; x.fillRect(836 + i * 13, 76 - bh, 9, bh); }
  // wifi: three arcs + dot
  x.lineWidth = 5.5; x.lineCap = 'round';
  for (const r of [9, 19, 29]) { x.beginPath(); x.arc(918, 78, r, -Math.PI * 0.76, -Math.PI * 0.24); x.stroke(); }
  x.beginPath(); x.arc(918, 76, 3.5, 0, 7); x.fill();
  // battery
  x.lineWidth = 3; x.globalAlpha = 0.55; x.beginPath(); x.roundRect(958, 48, 56, 28, 8); x.stroke();
  x.fillRect(1017, 56, 4, 12); x.globalAlpha = 1; x.beginPath(); x.roundRect(963, 53, 46, 18, 4); x.fill();
  document.title = 'ready';
};
im.onerror = () => console.log('img error');
im.src = '${img}';
</script></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (const size of SIZES) {
  const dir = path.join(OUT, size.dir);
  fs.mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: size.w, height: size.h });
  for (const [i, s] of SCREENS.entries()) {
    const img = `data:image/png;base64,${fs.readFileSync(path.join(RAW, s.file)).toString('base64')}`;
    await page.goto('about:blank');
    await page.setContent(html(size, s, img));
    await page.waitForFunction(() => document.title === 'ready');
    const name = `${String(i + 1).padStart(2, '0')}-${s.kicker.toLowerCase().replace(/[^a-z]+/g, '-')}.png`;
    await page.screenshot({ path: path.join(dir, name) });
    console.log(size.dir, name);
  }
}
await browser.close();
