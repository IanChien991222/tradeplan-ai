// Hyperliquid Explorer
// 從排行榜自動發現和評級高表現交易員

import https from 'https';
import { analyzeTraderPerformance } from './whale_tracker.mjs';

const HYPERLIQUID_API = 'api.hyperliquid.xyz';

// ===== 交易員分類標準 =====
const TRADER_ARCHETYPES = {
  INSIDER: {
    name: 'Insider',
    description: '提前布局，高倉位，70-85% 勝率',
    criteria: {
      winRate: { min: 0.70, max: 0.85 },
      avgPositionSize: { min: 10000 }, // $10k+
      tradingFrequency: { max: 10 }, // 每天少於 10 筆
      holdingPeriod: { min: 24 } // 持倉時間 > 24小時
    }
  },
  SNIPER: {
    name: 'Sniper',
    description: '精準進場，快速止盈，90%+ 勝率',
    criteria: {
      winRate: { min: 0.90 },
      avgPositionSize: { min: 1000 }, // $1k+
      tradingFrequency: { min: 5, max: 30 }, // 每天 5-30 筆
      holdingPeriod: { max: 12 } // 持倉時間 < 12小時
    }
  },
  SCALPER: {
    name: 'Scalper',
    description: '高頻交易，小倉位，65%+ 勝率',
    criteria: {
      winRate: { min: 0.65 },
      avgPositionSize: { max: 5000 },
      tradingFrequency: { min: 30 }, // 每天 > 30 筆
      holdingPeriod: { max: 4 } // 持倉時間 < 4小時
    }
  },
  SWING_TRADER: {
    name: 'Swing Trader',
    description: '波段操作，中大倉位，60%+ 勝率',
    criteria: {
      winRate: { min: 0.60 },
      avgPositionSize: { min: 5000 },
      tradingFrequency: { max: 5 }, // 每天少於 5 筆
      holdingPeriod: { min: 48 } // 持倉時間 > 48小時
    }
  }
};

// ===== API 函數 =====
async function getLeaderboard() {
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
      type: 'leaderboard'
    }));
    req.end();
  });
}

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

// ===== 分析函數 =====
async function analyzeTraderDetail(address) {
  try {
    const fills = await getUserFills(address);
    
    if (!fills || fills.length === 0) {
      return null;
    }

    // 計算基本指標
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const recentFills = fills.filter(f => f.time > oneWeekAgo);
    const dailyFills = fills.filter(f => f.time > oneDayAgo);
    
    // 計算交易頻率
    const tradesPerDay = dailyFills.length;
    
    // 計算平均倉位大小
    const avgPositionSize = recentFills.reduce((sum, f) => 
      sum + (Number(f.px) * Number(f.sz)), 0
    ) / recentFills.length;
    
    // 計算持倉時間（簡化版）
    const positions = new Map();
    let totalHoldingTime = 0;
    let closedPositions = 0;
    
    for (const fill of recentFills.reverse()) {
      const key = fill.coin;
      
      if (fill.side === 'B') {
        if (!positions.has(key)) {
          positions.set(key, []);
        }
        positions.get(key).push({ time: fill.time, sz: Number(fill.sz) });
      } else if (fill.side === 'A' && positions.has(key)) {
        const buys = positions.get(key);
        if (buys.length > 0) {
          const holdingTime = (fill.time - buys[0].time) / (1000 * 60 * 60); // 小時
          totalHoldingTime += holdingTime;
          closedPositions++;
          buys.shift();
        }
      }
    }
    
    const avgHoldingPeriod = closedPositions > 0 ? totalHoldingTime / closedPositions : 0;
    
    // 計算勝率（簡化版）
    let wins = 0;
    let losses = 0;
    const coinGroups = new Map();
    
    for (const fill of recentFills) {
      if (!coinGroups.has(fill.coin)) {
        coinGroups.set(fill.coin, { buys: [], sells: [] });
      }
      
      const group = coinGroups.get(fill.coin);
      if (fill.side === 'B') {
        group.buys.push({ px: Number(fill.px), sz: Number(fill.sz) });
      } else {
        group.sells.push({ px: Number(fill.px), sz: Number(fill.sz) });
      }
    }
    
    for (const [coin, group] of coinGroups) {
      if (group.buys.length > 0 && group.sells.length > 0) {
        const avgBuyPx = group.buys.reduce((sum, b) => sum + b.px * b.sz, 0) / 
                        group.buys.reduce((sum, b) => sum + b.sz, 0);
        const avgSellPx = group.sells.reduce((sum, s) => sum + s.px * s.sz, 0) / 
                         group.sells.reduce((sum, s) => sum + s.sz, 0);
        
        if (avgSellPx > avgBuyPx) wins++;
        else losses++;
      }
    }
    
    const winRate = (wins + losses) > 0 ? wins / (wins + losses) : 0;
    
    return {
      address,
      tradesPerDay,
      avgPositionSize,
      avgHoldingPeriod,
      winRate,
      totalTrades: recentFills.length,
      wins,
      losses
    };
    
  } catch (error) {
    console.error(`分析錯誤 (${address}):`, error.message);
    return null;
  }
}

// ===== 分類函數 =====
function classifyTrader(metrics) {
  if (!metrics) return null;
  
  const scores = {};
  
  for (const [type, archetype] of Object.entries(TRADER_ARCHETYPES)) {
    let score = 0;
    const criteria = archetype.criteria;
    
    // 檢查勝率
    if (criteria.winRate) {
      if (metrics.winRate >= criteria.winRate.min && 
          (!criteria.winRate.max || metrics.winRate <= criteria.winRate.max)) {
        score += 30;
      }
    }
    
    // 檢查倉位大小
    if (criteria.avgPositionSize) {
      if (metrics.avgPositionSize >= (criteria.avgPositionSize.min || 0) &&
          (!criteria.avgPositionSize.max || metrics.avgPositionSize <= criteria.avgPositionSize.max)) {
        score += 25;
      }
    }
    
    // 檢查交易頻率
    if (criteria.tradingFrequency) {
      if (metrics.tradesPerDay >= (criteria.tradingFrequency.min || 0) &&
          metrics.tradesPerDay <= (criteria.tradingFrequency.max || 999)) {
        score += 25;
      }
    }
    
    // 檢查持倉時間
    if (criteria.holdingPeriod) {
      if (metrics.avgHoldingPeriod >= (criteria.holdingPeriod.min || 0) &&
          (!criteria.holdingPeriod.max || metrics.avgHoldingPeriod <= criteria.holdingPeriod.max)) {
        score += 20;
      }
    }
    
    scores[type] = score;
  }
  
  // 找出最高分的類型
  let bestType = null;
  let bestScore = 0;
  
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  
  // 如果分數太低（< 50），視為 'UNKNOWN'
  if (bestScore < 50) {
    return {
      type: 'UNKNOWN',
      score: bestScore,
      confidence: 'LOW'
    };
  }
  
  return {
    type: bestType,
    archetype: TRADER_ARCHETYPES[bestType],
    score: bestScore,
    confidence: bestScore >= 80 ? 'HIGH' : bestScore >= 60 ? 'MEDIUM' : 'LOW'
  };
}

// ===== 主探索函數 =====
export async function exploreTopTraders(limit = 50) {
  try {
    console.log(`[${new Date().toISOString()}] 🔍 開始探索 Top ${limit} 交易員...`);
    
    const leaderboard = await getLeaderboard();
    
    if (!leaderboard || leaderboard.length === 0) {
      console.log('無法獲取排行榜數據');
      return [];
    }
    
    const topTraders = leaderboard.slice(0, limit);
    const results = [];
    
    for (let i = 0; i < topTraders.length; i++) {
      const trader = topTraders[i];
      console.log(`[${i + 1}/${topTraders.length}] 分析: ${trader.user || trader.address}`);
      
      const metrics = await analyzeTraderDetail(trader.user || trader.address);
      
      if (metrics) {
        const classification = classifyTrader(metrics);
        
        results.push({
          rank: i + 1,
          address: trader.user || trader.address,
          metrics,
          classification,
          leaderboardData: trader
        });
        
        console.log(`  → 類型: ${classification.type}, 信心度: ${classification.confidence}`);
        console.log(`  → 勝率: ${(metrics.winRate * 100).toFixed(1)}%, 日交易: ${metrics.tradesPerDay}`);
      }
      
      // API 限速
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
    
  } catch (error) {
    console.error('探索錯誤:', error.message);
    return [];
  }
}

// ===== 篩選高價值目標 =====
export function filterHighValueTargets(traders, targetType = 'INSIDER') {
  return traders
    .filter(t => t.classification && t.classification.type === targetType)
    .filter(t => t.classification.confidence === 'HIGH' || t.classification.confidence === 'MEDIUM')
    .sort((a, b) => b.classification.score - a.classification.score);
}

// ===== 生成追蹤建議 =====
export function generateTrackingRecommendations(traders) {
  const insiders = filterHighValueTargets(traders, 'INSIDER');
  const snipers = filterHighValueTargets(traders, 'SNIPER');
  
  console.log('\n===== 追蹤建議 =====');
  
  console.log(`\n🎯 Insiders (${insiders.length})：`);
  insiders.slice(0, 10).forEach((t, i) => {
    console.log(`${i + 1}. ${t.address.substring(0, 10)}... - 勝率: ${(t.metrics.winRate * 100).toFixed(1)}%, 倉位: $${t.metrics.avgPositionSize.toFixed(0)}`);
  });
  
  console.log(`\n🎯 Snipers (${snipers.length})：`);
  snipers.slice(0, 10).forEach((t, i) => {
    console.log(`${i + 1}. ${t.address.substring(0, 10)}... - 勝率: ${(t.metrics.winRate * 100).toFixed(1)}%, 日交易: ${t.metrics.tradesPerDay}`);
  });
  
  return { insiders, snipers };
}

// ===== 命令行執行 =====
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const traders = await exploreTopTraders(50);
    generateTrackingRecommendations(traders);
  })();
}

export { analyzeTraderDetail, classifyTrader, TRADER_ARCHETYPES };
