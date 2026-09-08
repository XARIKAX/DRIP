import { createServer } from "node:http";
import { createPublicClient, createWalletClient, http, erc20Abi, formatEther } from "viem";
import { loadConfig } from "./config.js";
import { HolderIndex } from "./holders.js";
import { activateDue, settleDue } from "./jobs.js";
import { log } from "./log.js";

/**
 * The Osinko keeper.
 *
 * Two jobs, on a timer:
 *
 *   activate  pay holders the moment their entitlement exists, rather than whenever
 *             someone remembers to. Gas only.
 *   settle    on the pay date, pay the protocol what the issuer paid. Real USDG, out
 *             of this wallet, so it is off until SETTLE_ENABLED turns it on.
 *
 * What it deliberately does NOT do is declare dividends. That needs ORACLE_ROLE and
 * real corporate action data, and a keeper that invented either would be inventing
 * payments. Declaration stays a human decision made against a data source, run
 * through contracts/script/DeclareDividends.s.sol.
 */
const state = {
  startedAt: new Date().toISOString(),
  lastCycle: null as string | null,
  lastError: null as string | null,
  cycles: 0,
};

async function main(): Promise<void> {
  const config = loadConfig();
  const transport = http(config.rpcUrl);
  const client = createPublicClient({ chain: config.chain, transport });
  const wallet = createWalletClient({ chain: config.chain, transport, account: config.account });
  const index = new HolderIndex(client, config);

  log.info("keeper starting", {
    chainId: config.chain.id,
    keeper: config.account.address,
    dripCore: config.deployment.dripCore,
    settleEnabled: config.settleEnabled,
    dryRun: config.dryRun,
    intervalSeconds: config.intervalMs / 1000,
  });

  // Health first, so Railway sees a live service even while the first scan runs. Not
  // in one shot mode: an open listener would hold the process open after the single
  // cycle finished, turning `pnpm once` into something that never returns.
  if (!config.runOnce) {
    const server = createServer((req, res) => {
      const healthy = state.lastError === null;
      res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...state, keeper: config.account.address, path: req.url }, null, 2));
    });
    // Without this, a bind failure raises an unhandled 'error' event and Node prints a
    // stack trace and exits — no structured log, nothing in Railway's log stream to say
    // the port was taken. Fail with a sentence instead.
    server.on("error", (err) => {
      log.error("health server failed", { port: config.port, reason: err.message });
      process.exit(1);
    });
    server.listen(config.port, () => log.info("health listening", { port: config.port }));
  }

  // A keeper with no gas silently does nothing, which looks identical to a keeper
  // with nothing to do. Say which one this is, at boot and every cycle.
  await reportBalances(config, client);

  const cycle = async (): Promise<void> => {
    // The chain's clock, never the host's. Every deadline the keeper reasons about —
    // ex dates, pay dates — is compared against block.timestamp inside the contracts,
    // and the two clocks are not the same one. Date.now() here made the keeper miss a
    // dividend whose ex date the chain had already passed, and would equally have had
    // it push transactions the chain then reverted as early.
    const head = await client.getBlock();
    await index.sync(head.number);
    await activateDue(config, client, wallet, index, head.timestamp);
    await settleDue(config, client, wallet, head.timestamp);
    state.cycles++;
    state.lastCycle = new Date().toISOString();
    state.lastError = null;
  };

  for (;;) {
    try {
      await cycle();
    } catch (err) {
      // One bad cycle is an RPC hiccup, not a reason to lose the process and the
      // holder index with it. Record it, let the health endpoint go red, try again.
      state.lastError = (err as Error).message;
      log.error("cycle failed", { reason: state.lastError });
    }
    if (config.runOnce) break;
    await new Promise((r) => setTimeout(r, config.intervalMs));
  }
}

async function reportBalances(
  config: ReturnType<typeof loadConfig>,
  client: ReturnType<typeof createPublicClient>
): Promise<void> {
  const [eth, usdg] = await Promise.all([
    client.getBalance({ address: config.account.address }),
    client.readContract({
      address: config.deployment.usdg,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [config.account.address],
    }),
  ]);
  log.info("keeper balances", { eth: formatEther(eth), usdg: usdg.toString() });
  if (eth === 0n) log.error("keeper has no ETH; every transaction will fail");
}

main().catch((err) => {
  // Config errors land here. Exit non-zero so Railway restarts rather than parking a
  // process that will never do anything.
  log.error("keeper failed to start", { reason: (err as Error).message });
  process.exit(1);
});
