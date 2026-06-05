# tradeplan-ai

Automated crypto trading analysis and whale tracking system for Bitget and Hyperliquid.

## Features

### 1. Bitget Scanner
Automated technical analysis scanner with Telegram notifications for multiple trading pairs:
- BTCUSDT, ETHUSDT, XAUUSD, NAS100
- Real-time backtesting capabilities
- Automated alert system

### 2. Hyperliquid Whale Tracker 🐋
Real-time monitoring of high-performing traders on Hyperliquid DEX with automated classification.

#### Trader Archetypes:

**Type A - Insiders** 🎯
- Win Rate: 70-85%
- Strategy: Early positioning, high capital deployment
- Position Size: $10,000+
- Trading Frequency: <10 trades/day
- Holding Period: >24 hours

**Type B - Snipers** 🎯
- Win Rate: 90%+
- Strategy: Precision entries, quick profit-taking
- Position Size: $1,000+
- Trading Frequency: 5-30 trades/day
- Holding Period: <12 hours

**Additional Archetypes:**
- **Scalpers**: High-frequency, small positions, 65%+ win rate
- **Swing Traders**: Medium-term holds, larger positions, 60%+ win rate

## Setup

### Prerequisites
```bash
npm install
```

### Environment Variables
Create a `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## Usage

### 1. Run Bitget Scanner
```bash
node scanner.mjs
```

### 2. Discover Top Traders (Hyperliquid)
```bash
node hyperliquid_explorer.mjs
```

This will:
- Fetch top 50 traders from Hyperliquid leaderboard
- Analyze each trader's performance metrics
- Classify traders by archetype
- Generate tracking recommendations

### 3. Start Whale Tracker
```bash
node whale_tracker.mjs
```

Monitors specific addresses and sends Telegram alerts when they open new positions.

#### Adding Traders to Track:
Edit `whale_tracker.mjs`:
```javascript
const TRACKED_TRADERS = [
  { 
    address: '0x1234...', 
    type: 'Insider', 
    name: 'Whale #1' 
  },
  { 
    address: '0x5678...', 
    type: 'Sniper', 
    name: 'Pro Trader' 
  },
];
```

## Architecture

```
tradeplan-ai/
├── scanner.mjs              # Bitget scanner with backtesting
├── whale_tracker.mjs        # Real-time Hyperliquid address monitoring
├── hyperliquid_explorer.mjs # Automated trader discovery & classification
├── telegram.mjs             # Telegram notification system
├── index.mjs               # Main entry point
└── server.mjs              # API server (placeholder)
```

## Whale Tracker Workflow

1. **Discovery Phase** (hyperliquid_explorer.mjs)
   - Scan Hyperliquid leaderboard
   - Analyze trader performance
   - Calculate metrics: win rate, position size, frequency, holding period
   - Classify by archetype with confidence score

2. **Tracking Phase** (whale_tracker.mjs)
   - Monitor specific addresses 24/7
   - Detect new fills/positions
   - Send instant Telegram alerts
   - Track notification history (24h window)

3. **Alert Format**
   ```
   🚨 Whale Alert: Insider
   👤 Trader: Whale #1
   📍 Address: 0x1234...abcd
   
   💰 Trade Details:
   • Coin: BTC
   • Side: 🟢 BUY
   • Price: $43,250.00
   • Size: 2.5000
   • Value: $108,125.00
   
   ⏰ Time: 2025/01/15 14:30:25
   ```

## API Rate Limits

- Hyperliquid API: 1 request/second recommended
- Explorer: 1 second delay between trader analyses
- Whale Tracker: 10 second monitoring cycle

## Trader Classification Algorithm

Scoring system (0-100):
- Win Rate Match: 30 points
- Position Size Match: 25 points
- Trading Frequency Match: 25 points
- Holding Period Match: 20 points

Confidence Levels:
- **HIGH**: Score ≥ 80
- **MEDIUM**: Score ≥ 60
- **LOW**: Score < 60

## Roadmap

- [ ] Web dashboard for live monitoring
- [ ] Historical performance tracking
- [ ] Multi-exchange support
- [ ] Advanced PnL calculation
- [ ] Machine learning-based classification
- [ ] Copy trading automation

## License

MIT
