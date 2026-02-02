# Sapience Skill

Prediction markets on Ethereal. Trade parlays, provide liquidity, claim winnings.

## Installation

Give your agent this repo URL:
```
https://github.com/sapiencexyz/openclaw-sapience
```

## Setup

1. **Fund wallet** - Buy USDe on Arbitrum via Bankr, bridge to Ethereal at deposit.ethereal.trade
2. **Set key** - `openclaw secrets set SAPIENCE_PRIVATE_KEY 0x...`

## What's Included

| File | Purpose |
|------|---------|
| `SKILL.md` | Protocol reference - GraphQL, WebSocket, signing, contracts |
| `HEARTBEAT_PREDICT.md` | Taker flow - research markets, build parlays, execute predictions |
| `HEARTBEAT_MM.md` | Maker flow - manage liquidity listener, adjust strategy |
| `lib/mm-listener.js` | Reference market maker script (background process) |

## Configuration

### Taker (Predictions)

Store in agent memory:

```yaml
max_wager_usde: 100          # Max per prediction
max_open_positions: 5        # Position limit
max_daily_loss_usde: 500     # Stop-loss
min_conviction: 0.65         # Don't bet below this
min_edge_vs_market: 0.05     # 5% edge required
min_legs: 2                  # Sapience requires 2+
max_legs: 5                  # Complexity limit
bid_wait_seconds: 45         # Auction duration
min_quote_ratio: 0.8         # Accept if maker offers ≥80%
```

### Maker (Liquidity)

Store in `~/.sapience/mm-config.yaml`:

```yaml
min_edge_pct: 0.02           # 2% minimum edge to bid
max_edge_pct: 0.35           # 35% cap
kelly_fraction: 0.25         # 25% of Kelly-optimal
min_wager_usde: 10           # Ignore tiny auctions
max_wager_usde: 1000         # Skip whale auctions
max_position_pct: 0.05       # 5% of bankroll per position
max_exposure_pct: 0.50       # 50% total exposure cap
bid_expiry_seconds: 60       # Quote validity
reconnect_delay_ms: 5000     # WS reconnect backoff
```

## Quick Reference

| Action | Method | Endpoint |
|--------|--------|----------|
| List markets | GraphQL | `api.sapience.xyz/graphql` |
| Start auction | WebSocket | `wss://api.sapience.xyz/auction` |
| Submit bid | WebSocket | `wss://api.sapience.xyz/auction` |
| Claim winnings | On-chain | `PredictionMarket.burn(tokenId)` |

## Chain

- **Network**: Ethereal (5064014)
- **Collateral**: WUSDe
- **Contract**: `0xAcD757322df2A1A0B3283c851380f3cFd4882cB4`

## Publishing

```bash
# Publish to ClawHub
clawhub publish . --slug sapience --name "Sapience" --version 1.0.0 --changelog "Initial release"

# Future versions
clawhub publish . --slug sapience --version 2.0.0 --changelog "Breaking changes..."
```

Version in `SKILL.md` frontmatter and `package.json` should match.

## Contributing

PRs welcome. See `CLAUDE.md` for guidelines.

## License

MIT
