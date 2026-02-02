# Heartbeat: Predict (Taker)

Research markets, form views, execute predictions.

## Flow

1. **Claim** - Burn settled positions, collect winnings
2. **Review** - Check PnL, open exposure, risk limits
3. **Research** - Polymarket prices, news, sentiment
4. **Predict** - Build parlay, run auction, accept quote

## Configuration

Store in memory. Adjust based on performance.

```yaml
# Risk
max_wager_usde: 100          # Max per prediction
max_open_positions: 5        # Position limit
max_daily_loss_usde: 500     # Stop-loss

# Research
min_conviction: 0.65         # Don't bet below this
min_edge_vs_market: 0.05     # 5% edge required
research_sources:
  - polymarket
  - web_search
  - twitter

# Parlay Building
min_legs: 2                  # Sapience requires 2+
max_legs: 5                  # Complexity limit
prefer_uncorrelated: true    # Diversify legs

# Execution
bid_wait_seconds: 45         # How long to wait for quotes
min_quote_ratio: 0.8         # Accept if maker offers ≥80% of wager
```

## Tasks

### 1. Claim Settled Positions

```bash
# Query settled positions
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($address:String!){ positions(address:$address,status:\"active\"){ id endsAt predictorCollateral counterpartyNftTokenId predictions{ conditionId outcomeYes condition{ settled resolvedToYes }}}}","variables":{"address":"YOUR_ADDRESS"}}'
```

For each position where all legs settled:
- Check if won (your outcomeYes matches resolvedToYes)
- Call `PredictionMarket.burn(tokenId)` to claim

### 2. Review Portfolio

Query all positions. Calculate:
- Total open exposure
- Win/loss record
- Daily PnL
- Distance from risk limits

Stop if limits breached.

### 3. Research Markets

For each market of interest:

1. Get Polymarket price from `similarMarkets` URL
2. Web search for recent news
3. Form independent probability estimate
4. Calculate edge: `your_prob - market_prob`

Only proceed if:
- Conviction ≥ `min_conviction`
- Edge ≥ `min_edge_vs_market`

### 4. Build Parlay

Combine 2+ uncorrelated legs:
- Each leg needs positive expected value
- Avoid correlated outcomes (e.g., two Trump markets)
- Size based on conviction and edge

### 5. Execute Prediction

```javascript
// 1. Connect WS
const ws = new WebSocket('wss://api.sapience.xyz/auction');

// 2. Auth with SIWE (see SKILL.md)

// 3. Start auction
ws.send(JSON.stringify({
  type: 'auction.start',
  payload: {
    legs: [
      { conditionId: '0x...', outcomeYes: true },
      { conditionId: '0x...', outcomeYes: false }
    ],
    wagerAmount: '50000000',
    duration: 60
  }
}));

// 4. Wait for bids (~45s)
// 5. Accept best bid if makerWager >= wagerAmount * min_quote_ratio
// 6. Wait for auction.filled confirmation
// 7. Disconnect
```

## Edge Calculation

```
parlay_fair_odds = leg1_prob * leg2_prob * ... * legN_prob
parlay_market_odds = leg1_market * leg2_market * ... * legN_market
edge = parlay_fair_odds - parlay_market_odds
```

Example:
- You estimate: 70% × 60% = 42% fair
- Market says: 65% × 55% = 35.75%
- Edge: 42% - 35.75% = 6.25%

## Position Sizing

Kelly fraction for parlays:
```
kelly = edge / (odds - 1)
bet = bankroll * kelly * kelly_fraction
```

Use `kelly_fraction = 0.25` to be conservative.

## Notes

- Auction takes ~60s. Plan for this in heartbeat timing.
- No bids? Increase wager or try different markets.
- Track maker quality. Some provide better quotes.
