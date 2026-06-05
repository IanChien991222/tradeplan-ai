// Hyperliquid Whale Tracker
// 追蹤特定地址的交易活動並推送到 Telegram

import https from 'https';

// ===== 配置區 =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID';
const HYPERLIQUID_API = 'api.hyperliquid.xyz';

// 追蹤地址列表（可動態添加）
const TRACKED_TRADERS = [
  // Type A - Insiders (70-85% 勝率，提前布局，高倉位)
  // { address: '0x...', type: 'Insider', name: 'Trader A' },
  
  // Type B - Snipers (90%+ 勝率，精準進場，快速止盈)
  // { address: '0x...', type: 'Sniper', name: 'Trader B' },
];

// 已通知的交易記錄（避免重複推送）
const notifiedTrades = new Map();

// ===== Hyperliquid API 函數 =====
async function getUserFills(address) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HYPERLIQUID_API,
      path: '/info',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({
      type: 'userFills',
      user: address
    }));
    req.end();
  });
}

async function getUserState(address) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HYPERLIQUID_API,
      path: '/info',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({
      type: 'clearinghouseState',
      user: address
    }));
    req.end();
  });
}

// ===== Telegram 推送函數 =====
async function sendTelegramAlert(trader, fill) {
  const message = `
🚨 *Whale Alert: ${trader.type}*
👤 *Trader:* ${trader.name || 'Unknown'}
📍 *Address:* \`${trader.address.substring(0, 8)}...${trader.address.substring(trader.address.length - 6)}\`

💰 *Trade Details:*
• Coin: *${fill.coin}*
• Side: ${fill.side === 'B' ? '🟢 BUY' : '🔴 SELL'}
• Price: $${Number(fill.px).toFixed(4)}
• Size: ${Number(fill.sz).toFixed(4)}
• Value: $${(Number(fill.px) * Number(fill.sz)).toFixed(2)}

⏰ Time: ${new Date(fill.time).toLocaleString('en-US', { timeZone: 'Asia/Taipei' })}
`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.write(JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    }));
    req.end();
  });
}

// ===== 主監控邏輯 =====
async function monitorTrader(trader) {
  try {
    const fills = await getUserFills(trader.address);
    
    if (!fills || fills.length === 0) {
      return;
    }

    // 檢查最近的交易
    const recentFills = fills.slice(0, 5); // 只檢查最近 5 筆
    
    for (const fill of recentFills) {
      const tradeId = `${trader.address}_${fill.time}_${fill.oid}`;
      
      // 如果這筆交易還沒通知過
      if (!notifiedTrades.has(tradeId)) {
        console.log(`[${new Date().toISOString()}] 發現新交易: ${trader.name} - ${fill.coin} ${fill.side}`);
        
        // 推送到 Telegram
        await sendTelegramAlert(trader, fill);
        
        // 標記為已通知
        notifiedTrades.set(tradeId, Date.now());
        
        // 延遲避免 API 限速
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // 清理舊的通知記錄（超過 24 小時）
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, value] of notifiedTrades.entries()) {
      if (value < oneDayAgo) {
        notifiedTrades.delete(key);
      }
    }
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 監控錯誤 (${trader.name}):`, error.message);
  }
}

async function runWhaleTracker() {
  console.log(`[${new Date().toISOString()}] 🐋 Whale Tracker 啟動`);
  console.log(`追蹤 ${TRACKED_TRADERS.length} 個地址`);
  
  while (true) {
    for (const trader of TRACKED_TRADERS) {
      await monitorTrader(trader);
      // 每個地址間隔 1 秒
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 每輪完成後等待 10 秒再開始下一輪
    console.log(`[${new Date().toISOString()}] 本輪監控完成，等待下一輪...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

// ===== 工具函數：計算交易員績效 =====
export async function analyzeTraderPerformance(address, days = 30) {
  try {
    const fills = await getUserFills(address);
    
    if (!fills || fills.length === 0) {
      return null;
    }
    
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentFills = fills.filter(f => f.time > cutoffTime);
    
    // 計算 PnL（簡化版，實際需要更複雜的計算）
    let totalPnL = 0;
    let wins = 0;
    let losses = 0;
    
    // 按幣種分組計算
    const positions = new Map();
    
    for (const fill of recentFills) {
      if (!positions.has(fill.coin)) {
        positions.set(fill.coin, { buys: [], sells: [] });
      }
      
      const pos = positions.get(fill.coin);
      if (fill.side === 'B') {
        pos.buys.push({ px: Number(fill.px), sz: Number(fill.sz), time: fill.time });
      } else {
        pos.sells.push({ px: Number(fill.px), sz: Number(fill.sz), time: fill.time });
      }
    }
    
    // 簡單計算（實際應該用 FIFO 或其他方法）
    for (const [coin, pos] of positions) {
      const avgBuyPx = pos.buys.reduce((sum, b) => sum + b.px * b.sz, 0) / pos.buys.reduce((sum, b) => sum + b.sz, 0);
      const avgSellPx = pos.sells.reduce((sum, s) => sum + s.px * s.sz, 0) / pos.sells.reduce((sum, s) => sum + s.sz, 0);
      
      if (avgSellPx > avgBuyPx) wins++;
      else if (avgSellPx < avgBuyPx) losses++;
    }
    
    const winRate = wins / (wins + losses);
    
    return {
      address,
      winRate: (winRate * 100).toFixed(2) + '%',
      totalTrades: recentFills.length,
      wins,
      losses,
      period: `${days} days`
    };
    
  } catch (error) {
    console.error('分析錯誤:', error.message);
    return null;
  }
}

// ===== 啟動 =====
if (import.meta.url === `file://${process.argv[1]}`) {
  runWhaleTracker();
}

export { runWhaleTracker, monitorTrader, sendTelegramAlert };
