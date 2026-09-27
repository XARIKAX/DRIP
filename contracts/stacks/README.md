# Stack recipes

One file per chain. Each entry is a basket: a name, a ticker, and the raw amount of
each constituent that one whole share (1e18) is made of.

**Units are raw token amounts, not percentages.** `unitsPerShare` for a token with 18
decimals is `0.02 * 1e18 = 20000000000000000`; for one with 6 decimals it is
`25 * 1e6 = 25000000`. Getting the decimals wrong builds a basket that mints and
redeems perfectly while holding a thousandth of what was intended, so every address
here is checked with `script/inspect-tokens.sh` before it is added, and the decimals it
returned are written into the file beside it.

The `decimals` and `note` fields are documentation — the contract never reads them.
They are here so a recipe can be reviewed by a person rather than only by a machine.

Weights are not stored. The builder at `/build` thinks in percentages because a human
designing a basket does; the chain thinks in units because honouring a percentage would
mean pricing every constituent at the moment of a trade, and nothing prices a memecoin.
The conversion happens once, here, where a missing price is a visible problem rather
than a revert in somebody's mint.
