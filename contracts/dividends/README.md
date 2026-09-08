# Dividend feed

`DeclareDividends.s.sol` reads `<chainid>.json` from this directory and puts what it
says on the calendar. One file per chain.

```json
{
  "dividends": [
    { "symbol": "AAPL", "amountPerToken": 260000, "exDate": 1790000000, "payDate": 1791800000 }
  ]
}
```

- `symbol` must exist in `deployments/<chainid>.json` under `tokens`.
- `amountPerToken` is USDG per whole share, 6 decimals. `260000` is $0.26.
- `exDate` / `payDate` are unix seconds. The registry refuses an ex date in the past
  and a settlement window longer than 90 days.

Re-running is safe. An entry already on the calendar with the same token, amount and
ex date is skipped rather than declared twice.

## Where the data comes from

Nowhere in this repo. **This file has to be produced from real issuer corporate action
data by whoever operates the protocol**, and keeping it truthful is the single largest
trust assumption in the system (`HANDOFF.md` §5).

A declared dividend causes the pool to advance real USDG at the ex date. If the issuer
never declared it, that money is gone and the loss lands on the LPs — which is what the
utilisation cap and clawback exist to bound, not to prevent.

Whoever holds `ORACLE_ROLE` is accountable for every row in here.
