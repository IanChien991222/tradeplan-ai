import fetch from 'node-fetch';
import fs from 'fs';

// 載入 .env
try {
  const l = fs.readFileSync('.env', 'utf8').split('\n');
  for (const ln of l) {
    const i = ln.indexOf('=');
    if (i > 0) process.env[ln.slice(0, i).trim()] = ln.slice(i + 1).trim();
  }
} catch {}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const INTERVAL = 15 * 60 * 1000; // 15 min
const MIN_VOL = +(process.env.MIN_VOLUME_USDT || 150000);
const VOL_SPIKE = +(process.env.VOLUME_SPIKE || 2);
const COOLDOWN = 4 * 60 * 60 * 1000; // 4 hr
const cooldowns = new Map();

// Telegram 推播
async function tg(t) {
  if (!TOKEN || !CHAT_ID) {
    console.log('[TG未設]', t.slice(0, 60));
    return;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: t, parse_mode: 'Markdown' })
    });
    const j = await r.json();
    if (!j.ok) console.error('[TG錯]', j.description);
  } catch (e) {
    console.error('[TG失]', e.message);
  }
}

// EMA
function ema(a, p) {
  const k = 2 / (p + 1);
  let e = a[0];
  for (let i = 1; i < a.length; i++) e = a[i] * k + e * (1 - k);
  return e;
}

// RSI (修正 bug：i.length → i<c.length)
function rsi(c, p = 14) {
  if (c.length < p + 1) return 50;
  let g = 0, l = 0;
  for (let i = c.length - p; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d;
    else l += Math.abs(d);
  }
  return 100 - 100 / (1 + g / (l || 0.001));
}

// MACD
function macd(c) {
  if (c.length < 27) return { hist: 0, prevHist: 0 };
  const e12 = ema(c.slice(-12), 12);
  const e26 = ema(c.slice(-26), 26);
  const pe12 = ema(c.slice(-13, -1), 12);
  const pe26 = ema(c.slice(-27, -1), 26);
  const m = e12 - e26;
  const pm = pe12 - pe26;
  const sig = ema([pm, m], 9);
  const ps = ema([pm * 0.9, pm], 9);
  return { hist: m - sig, prevHist: pm - ps };
}

// 布林帶
function bb(c, p = 20) {
  const s = c.slice(-p);
  const mean = s.reduce((a, b) => a + b, 0) / p;
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
  return { upper: mean + 2 * std, lower: mean - 2 * std };
}

// 連續陽/陰線
function cc(k) {
  let u = 0, d = 0;
  for (let i = k.length - 1; i >= k.length - 5 && i >= 0; i--) {
    if (k[i].close > k[i].open) u++;
    else break;
  }
  for (let i = k.length - 1; i >= k.length - 5 && i >= 0; i--) {
    if (k[i].close < k[i].open) d++;
    else break;
  }
  return { u, d };
}

// 分析 K 線
function ana(k) {
  if (!k || k.length < 27) return null;
  const C = k.map(x => x.close);
  const V = k.map(x => x.volume);
  const H = k.map(x => x.high);
  const L = k.map(x => x.low);
  const close = C.at(-1);
  const curVol = V.at(-1);
  const avgVol = V.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const volSpike = curVol / (avgVol || 1);
  const e20 = ema(C.slice(-20), 20);
  const e50 = C.length >= 51 ? ema(C.slice(-50), 50) : null;
  const pe20 = ema(C.slice(-21, -1), 20);
  const pe50 = C.length >= 52 ? ema(C.slice(-51, -1), 50) : null;
  const r = rsi(C);
  const m = macd(C);
  const b = bb(C);
  const con = cc(k);
  const support = Math.min(...L.slice(-20));
  const resist = Math.max(...H.slice(-20));
  return { close, volSpike, e20, e50, pe20, pe50, r, m, b, con, support, resist };
}

// 獲取 K 線
async function gk(s, g) {
  try {
    const r = await fetch(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${s}&granularity=${g}&limit=60`);
    const j = await r.json();
    const d = j.data || [];
    return d.map(k => ({
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      volume: +k[5]
    })).reverse();
  } catch {
    return null;
  }
}

// 決策引擎
function det(s, m15, h1, h4, ch24) {
  if (!m15 || !h1) return null;
  const now = Date.now();
  if (cooldowns.has(s) && now - cooldowns.get(s) < COOLDOWN) return null;

  const L = [], S = [];

  // 爆量
  if (m15.volSpike >= VOL_SPIKE) {
    L.push(`📊 15m 爆量 ${m15.volSpike.toFixed(1)}x`);
    S.push(`📊 15m 爆量 ${m15.volSpike.toFixed(1)}x`);
  }
  if (h1.volSpike >= VOL_SPIKE) {
    L.push(`📊 1h 爆量 ${h1.volSpike.toFixed(1)}x`);
    S.push(`📊 1h 爆量 ${h1.volSpike.toFixed(1)}x`);
  }

  // RSI
  if (m15.r > 50 && m15.r < 70) L.push(`📈 15m RSI ${m15.r.toFixed(0)} 健康多`);
  if (h1.r > 50 && h1.r < 70) L.push(`📈 1h RSI ${h1.r.toFixed(0)} 健康多`);
  if (h4 && h4.r > 50 && h4.r < 70) L.push(`📈 4h RSI ${h4.r.toFixed(0)} 健康多`);
  if (m15.r < 50 && m15.r > 30) S.push(`📉 15m RSI ${m15.r.toFixed(0)} 弱勢`);
  if (h1.r < 50 && h1.r > 30) S.push(`📉 1h RSI ${h1.r.toFixed(0)} 弱勢`);
  if (h4 && h4.r < 50 && h4.r > 30) S.push(`📉 4h RSI ${h4.r.toFixed(0)} 弱勢`);

  // 均線排列
  if (m15.e50 && m15.close > m15.e20 && m15.e20 > m15.e50) L.push(`📈 15m 多頭排列`);
  if (h1.e50 && h1.close > h1.e20 && h1.e20 > h1.e50) L.push(`📈 1h 多頭排列`);
  if (h4 && h4.e50 && h4.close > h4.e20 && h4.e20 > h4.e50) L.push(`📈 4h 多頭排列`);
  if (m15.e50 && m15.close < m15.e20 && m15.e20 < m15.e50) S.push(`📉 15m 空頭排列`);
  if (h1.e50 && h1.close < h1.e20 && h1.e20 < h1.e50) S.push(`📉 1h 空頭排列`);
  if (h4 && h4.e50 && h4.close < h4.e20 && h4.e20 < h4.e50) S.push(`📉 4h 空頭排列`);

  // 金叉/死叉
  if (m15.e50 && m15.pe20 < m15.pe50 && m15.e20 >= m15.e50) L.push(`✨ 15m 金叉`);
  if (h1.e50 && h1.pe20 < h1.pe50 && h1.e20 >= h1.e50) L.push(`✨ 1h 金叉`);
  if (m15.e50 && m15.pe20 > m15.pe50 && m15.e20 <= m15.e50) S.push(`💀 15m 死叉`);
  if (h1.e50 && h1.pe20 > h1.pe50 && h1.e20 <= h1.e50) S.push(`💀 1h 死叉`);

  // MACD 金叉/死叉
  if (m15.m.hist > 0 && m15.m.prevHist <= 0) L.push(`⚡ 15m MACD 金叉`);
  if (h1.m.hist > 0 && h1.m.prevHist <= 0) L.push(`⚡ 1h MACD 金叉`);
  if (m15.m.hist < 0 && m15.m.prevHist >= 0) S.push(`⚡ 15m MACD 死叉`);
  if (h1.m.hist < 0 && h1.m.prevHist >= 0) S.push(`⚡ 1h MACD 死叉`);

  // 支撐壓力
  if (m15.close > m15.resist * 0.999) L.push(`🚀 15m 突破壓力`);
  if (h1.close > h1.resist * 0.999) L.push(`🚀 1h 突破壓力`);
  if (m15.close < m15.support * 1.001) S.push(`💥 15m 跌破支撐`);
  if (h1.close < h1.support * 1.001) S.push(`💥 1h 跌破支撐`);

  // 布林帶
  if (m15.close > m15.b.upper) L.push(`📶 突破布林上軌`);
  if (m15.close < m15.b.lower) S.push(`📶 跌破布林下軌`);

  // 連續 K 線
  if (m15.con.u >= 3) L.push(`🕯 連續 ${m15.con.u} 根陽線`);
  if (m15.con.d >= 3) S.push(`🕯 連續 ${m15.con.d} 根陰線`);

  // 24h 漲跌幅
  if (ch24 >= 8) L.push(`🔥 24h 漲幅 +${ch24.toFixed(1)}%`);
  if (ch24 <= -8) S.push(`🔻 24h 跌幅 ${ch24.toFixed(1)}%`);

  // 判斷方向
  let dir = null, reasons = [];
  if (L.length >= 3 && L.length >= S.length) {
    dir = 'LONG 🟢';
    reasons = L;
  } else if (S.length >= 3) {
    dir = 'SHORT 🔴';
    reasons = S;
  }

  if (!dir) return null;

  // 計算 TP/SL
  const isLong = dir.includes('LONG');
  const entry = m15.close;
  const sl = isLong ? m15.support * 0.997 : m15.resist * 1.003;
  const risk = Math.abs(entry - sl);
  const tp1 = isLong ? entry + risk * 1.5 : entry - risk * 1.5;
  const tp2 = isLong ? entry + risk * 2.5 : entry - risk * 2.5;
  const rr = (Math.abs(tp1 - entry) / risk).toFixed(1);

  cooldowns.set(s, now);
  return { dir, reasons, entry, sl, tp1, tp2, rr };
}

// 訊息格式化
function msg(s, x) {
  const f = n => {
    const nm = Number(n);
    return nm < 0.01 ? nm.toFixed(6) : nm < 1 ? nm.toFixed(4) : nm.toFixed(2);
  };
  const t = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  return `🚨 *訊號警報*\n━━━━━━━━━━━━━━━\n📌 *${s}*\n方向：*${x.dir}*\n\n💰 *交易計畫*\n• Entry　　：\`${f(x.entry)}\`\n• Stop Loss：\`${f(x.sl)}\`\n• TP1　　　：\`${f(x.tp1)}\`\n• TP2　　　：\`${f(x.tp2)}\`\n• RR　　　：1:${x.rr}\n\n📊 *觸發條件（${x.reasons.length}項）*\n${x.reasons.map(r => `• ${r}`).join('\n')}\n\n⏰ ${t}\n━━━━━━━━━━━━━━━\n⚠️ 僅供參考，非投資建議`;
}

// 主掃描邏輯
async function scan() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log(`[掃描] ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })}`);

    // 1. 獲取所有 USDT 交易對
    const tickerRes = await fetch('https://api.bitget.com/api/v2/spot/market/tickers');
    const tickerData = await tickerRes.json();
    const tickers = tickerData.data || [];

    // 2. 過濾條件：USDT 交易對 + 24h 量 >= MIN_VOL (修正：使用 usdtVolume)
    const filtered = tickers.filter(t => 
      t.symbol.endsWith('USDT') && 
      +(t.usdtVolume || 0) >= MIN_VOL
    );

    console.log(`[結果] 共 ${filtered.length} 個交易對符合條件 (24h 量 >= $${MIN_VOL.toLocaleString()})`);

    if (filtered.length === 0) {
      console.log('[提示] 沒有交易對符合條件，等待下次掃描...');
      return;
    }

    // 3. 對每個交易對進行分析
    for (const t of filtered.slice(0, 30)) { // 限制最多掃描 30 個，避免過載
      const s = t.symbol;
      const ch24 = +t.changeUtc || 0;

      // 獲取多週期 K 線
      const [k15, k1h, k4h] = await Promise.all([
        gk(s, '15m'),
        gk(s, '1h'),
        gk(s, '4h')
      ]);

      // 分析
      const a15 = ana(k15);
      const a1h = ana(k1h);
      const a4h = ana(k4h);

      // 決策
      const signal = det(s, a15, a1h, a4h, ch24);

      if (signal) {
        console.log(`\n[訊號] ${s} - ${signal.dir}`);
        console.log(`  條件：${signal.reasons.length} 項`);
        console.log(`  Entry: ${signal.entry}, SL: ${signal.sl}, TP1: ${signal.tp1}, RR: 1:${signal.rr}`);
        
        // 推播到 Telegram
        const message = msg(s, signal);
        await tg(message);
      }

      // 避免過快請求
      await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n[完成] 本輪掃描結束');
    console.log('='.repeat(60));
  } catch (e) {
    console.error('[錯誤]', e.message);
  }
}

// 啟動定時掃描
setInterval(scan, INTERVAL);
scan(); // 立即執行第一次

console.log('\n✅ Scanner 已啟動，每 15 分鐘掃描一次');
