# Heartbeat: Market Making (Maker)

Manage liquidity provision via persistent listener process.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  Agent (you)    │────▶│  mm-listener.js  │
│  - Start/stop   │     │  - WS connection │
│  - Update config│     │  - Auto-bid      │
│  - Review perf  │     │  - Logging       │
└─────────────────┘     └──────────────────┘
         │                       │
         ▼                       ▼
  mm-config.yaml           mm.log
```

- **Listener**: Background process, persistent WS, auto-bids on auctions
- **Agent**: Manages lifecycle, reviews performance, adjusts strategy

## Flow

1. **Check Listener** - Running? Restart if dead
2. **Review Metrics** - Win rate, PnL, exposure
3. **Adjust Strategy** - Update config based on performance
4. **Risk Check** - Stop if limits breached

## Configuration

Store in `~/.sapience/mm-config.yaml`. Listener reloads on SIGHUP.

```yaml
# Pricing
min_edge_pct: 0.02           # 2% minimum edge to bid
max_edge_pct: 0.35           # 35% cap
kelly_fraction: 0.25         # 25% of Kelly-optimal

# Filtering
min_wager_usde: 10           # Ignore tiny auctions
max_wager_usde: 1000         # Skip whale auctions
whitelisted_takers: []       # Empty = accept all
single_leg_enabled: false    # Require 2+ legs
blocked_markets: []          # Markets to avoid

# Risk Management
max_position_pct: 0.05       # 5% of bankroll per position
max_exposure_pct: 0.50       # 50% total exposure cap
reserve_ratio: 0.20          # Keep 20% liquid
concentration_limit: 0.025   # 2.5% max per market

# Correlation
correlation_enabled: true
correlation_threshold: 0.70  # Reduce size if >70% correlated

# Execution
bid_expiry_seconds: 60       # Quote validity
reconnect_delay_ms: 5000     # WS reconnect backoff
```

## Listener Management

### Start Listener
```bash
SAPIENCE_PRIVATE_KEY=$KEY CONFIG_PATH=~/.sapience/mm-config.yaml \
  nohup node lib/mm-listener.js > ~/.sapience/mm.log 2>&1 &
echo $! > ~/.sapience/mm.pid
```

### Check Status
```bash
ps -p $(cat ~/.sapience/mm.pid) > /dev/null 2>&1 && echo "running" || echo "stopped"
```

### View Logs
```bash
tail -50 ~/.sapience/mm.log
```

### Stop Listener
```bash
kill $(cat ~/.sapience/mm.pid)
```

### Reload Config
```bash
kill -HUP $(cat ~/.sapience/mm.pid)
```

## Tasks

### 1. Check Listener Health

```bash
# Is process running?
if ! ps -p $(cat ~/.sapience/mm.pid) > /dev/null 2>&1; then
  echo "Listener dead, restarting..."
  # Restart command above
fi

# Check recent log activity
tail -10 ~/.sapience/mm.log | grep -E "(error|connected|bid)"
```

### 2. Review Performance

Query positions where you're the counterparty:
```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($address:String!){ positions(address:$address){ id status endsAt predictorCollateral counterpartyCollateral predictions{ outcomeYes condition{ settled resolvedToYes }}}}","variables":{"address":"YOUR_ADDRESS"}}'
```

Calculate:
- Win rate: positions won / total settled
- PnL: sum of (winnings - losses)
- Open exposure: sum of active position collateral
- Market concentration: exposure per market

### 3. Adjust Strategy

Based on review:
- Poor win rate → increase `min_edge_pct`
- Missing good auctions → decrease `min_wager_usde`
- Overexposed to market → add to `blocked_markets`
- High correlation losses → lower `correlation_threshold`

Update config file:
```bash
# Edit ~/.sapience/mm-config.yaml
# Then reload:
kill -HUP $(cat ~/.sapience/mm.pid)
```

### 4. Risk Check

Stop listener if:
- `open_exposure > bankroll * max_exposure_pct`
- `daily_loss > max_daily_loss`
- `concentration > concentration_limit` for any market

```bash
# Emergency stop
kill $(cat ~/.sapience/mm.pid)
```

## Pricing Logic

Listener needs pricing function. Implement in `lib/mm-listener.js`:

```javascript
function calculateQuote(auction, config) {
  // 1. Fetch Polymarket prices for each leg
  // 2. Calculate prediction fair value
  // 3. Apply edge requirement
  // 4. Check risk limits
  // 5. Return quote or null to skip

  const fairValue = legs.reduce((acc, leg) => acc * getPolymarketPrice(leg), 1);
  const requiredEdge = config.min_edge_pct;

  // Quote at fair value minus edge (you take opposite side)
  const quote = auction.wager * (1 - fairValue - requiredEdge);

  if (quote <= 0) return null;
  return quote;
}
```

## Notes

- Listener handles WS reconnection automatically
- Config file watched for changes, reloads without restart
- Logs include auction IDs for post-mortem analysis
- Test with small `max_wager_usde` first
