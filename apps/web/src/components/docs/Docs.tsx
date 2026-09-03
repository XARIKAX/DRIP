"use client";

import Link from "next/link";
import { listings } from "@drip-markets/sdk";
import { fmt, LiveCounter, shortDate } from "@/components/live";
import { Rosette } from "@/components/Guilloche";
import { TokenMark } from "@/components/TokenMark";
import { useCreditView, useDataSource, usePortfolioSummary, useTokensView, useVaultView } from "@/lib/data/provider";
import { DocsShell, type GlanceRow, type QuickLink, type TocGroup } from "@/components/docs/DocsShell";
import {
  ArchitectureFigure,
  CheckpointFigure,
  LifecycleFigure,
  LtvFigure,
  SplitFigure,
  StreamFigure,
  TimelineFigure,
  VaultFigure,
} from "@/components/docs/figures";
import { Callout, Code, Figure, Formula, Pair, Params, Section, Shot, Sub, Table, Terms } from "@/components/docs/primitives";

const REPO = "https://github.com/XARIKAX/DRIP";

const TOC: TocGroup[] = [
  {
    label: "Introduction",
    entries: [
      { id: "overview", index: "1", title: "Overview" },
      { id: "aave-of-stocks", index: "1.1", title: "The Aave of stocks", sub: true },
      { id: "what-it-is-not", index: "1.2", title: "What Osinko is not", sub: true },
    ],
  },
  {
    label: "Mechanics",
    entries: [
      { id: "custody", index: "2", title: "Custody and eligibility" },
      { id: "deposit", index: "2.1", title: "Deposit", sub: true },
      { id: "checkpoint", index: "2.2", title: "The ex date checkpoint", sub: true },
      { id: "modes", index: "2.3", title: "Modes", sub: true },
      { id: "activation", index: "2.4", title: "Activation", sub: true },
      { id: "early", index: "3", title: "Early — the advance vault" },
      { id: "stream", index: "4", title: "Stream" },
      { id: "reinvest", index: "5", title: "Reinvest" },
      { id: "borrow", index: "6", title: "Borrow" },
      { id: "split", index: "7", title: "Split — principal and yield" },
    ],
  },
  {
    label: "Settlement & risk",
    entries: [
      { id: "settlement", index: "8", title: "Settlement and clawback" },
      { id: "roles", index: "9", title: "Roles and trust" },
      { id: "risks", index: "10", title: "Risks" },
    ],
  },
  {
    label: "Reference",
    entries: [
      { id: "architecture", index: "11", title: "Architecture and contracts" },
      { id: "universe", index: "12", title: "Universe and oracles" },
      { id: "agent", index: "13", title: "Agent and SDK" },
      { id: "using", index: "14", title: "Using the app" },
      { id: "glossary", index: "15", title: "Glossary" },
    ],
  },
];

const LINKS: QuickLink[] = [
  { label: "Dashboard", href: "/app" },
  { label: "Deposit", href: "/app/deposit" },
  { label: "Borrow", href: "/app/borrow" },
  { label: "Split", href: "/app/split" },
  { label: "Advance vault", href: "/app/vault" },
  { label: "Ex date calendar", href: "/app/calendar" },
  { label: "Agent console", href: "/app/agent" },
  { label: "Source on GitHub", href: REPO, external: true },
  { label: "Developer handoff", href: `${REPO}/blob/HEAD/HANDOFF.md`, external: true },
];

/**
 * The documentation, in full.
 *
 * Written the way the product is built: the mechanism first, the numbers a contract
 * enforces beside every claim, and the risks stated rather than implied. Every live
 * figure on this page is bound to the same data source as the app, so a number quoted
 * here is the number the dashboard shows, not a number someone typed into a doc.
 */
export function Docs() {
  const source = useDataSource();
  const summary = usePortfolioSummary();
  const credit = useCreditView();
  const { vault } = useVaultView();
  const tokens = useTokensView();

  const ltvPct = credit.collateralValueUsd > 0 ? (credit.borrowedUsd / credit.collateralValueUsd) * 100 : 0;
  const universe = listings[4663]?.tokens.filter((t) => t.enabled) ?? [];

  const glance: GlanceRow[] = [
    { label: "Underlyings", value: `${universe.length} Robinhood stock tokens` },
    { label: "Settlement asset", value: "USDG · 6 dp" },
    { label: "Chain", value: "Robinhood Chain · Orbit L2" },
    { label: "Price oracle", value: "Chainlink · 1h heartbeat" },
    { label: "Eligibility", value: "Deposited before ex date" },
    { label: "Advance fee", value: "1% · ceiling 5%" },
    { label: "Utilisation cap", value: "80% · ceiling 95%" },
    { label: "Stream resolution", value: "1 second" },
    { label: "Max LTV · liquidation", value: "40% · 65%" },
    { label: "Split fee", value: "10 bps · ceiling 100" },
    { label: "Settlement window", value: "≤ 90 days" },
    { label: "Contracts · tests", value: "10 · 96 green" },
    {
      label: "Accrued while you read",
      value: <LiveCounter base={0} ratePerSec={summary.streamRatePerSec} decimals={6} prefix="$" className="text-cyan-deep" />,
    },
  ];

  const hero = (
    <header className="relative">
      {/* The rose engine, behind the title — the same watermark the certificate carries,
          so the reference is visibly printed on the same stock as the product. */}
      <div className="pointer-events-none absolute -right-10 -top-16 text-ink/[0.07] lg:-right-24" aria-hidden>
        <Rosette size={380} rings={30} R={100} r={28} a={68} drift={0.8} />
      </div>
      <div className="serial">Read me first</div>
      <h1 className="display relative mt-5 text-[clamp(40px,5.4vw,70px)] leading-[0.98] tracking-[-0.02em]">
        The Aave of stocks,
        <br />
        <span className="italic text-cyan-deep">in writing.</span>
      </h1>
      <p className="mt-8 max-w-[62ch] text-[17.5px] leading-[1.65] text-ink">
        Osinko is a money market for tokenized stocks on Robinhood Chain. Aave turned crypto
        collateral into a balance sheet anyone could borrow from; Osinko does the same for
        equities and the income they pay. Deposit a stock token once and its dividends stream
        per second, arrive at the ex date instead of the pay date, compound in the same
        transaction, and service a USDG credit line — or, if you opt in, trade as a token of
        their own.
      </p>
      <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.7] text-muted">
        This is the complete description of how, and of every number a contract enforces.
        Sections are numbered so they can be cited; the sheet on the right is the same set
        of parameters the contracts hold.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <span className="pill">Robinhood Chain</span>
        <span className="pill">Self custody</span>
        <span className="pill">Interfaces frozen</span>
        <span className="pill-live">
          <span className="beacon" aria-hidden />
          {source === "demo" ? "Live against the reference portfolio" : "Live against your wallet"}
        </span>
      </div>
    </header>
  );

  return (
    <DocsShell toc={TOC} glance={glance} links={LINKS} hero={hero}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. Overview                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="overview"
        index="1"
        title="Overview"
        kicker="A dividend is the oldest promise in finance. Osinko is the plumbing that promise never had."
      >
        <p>
          <strong>Osinko</strong> — Finnish for <em>dividend</em>, ticker <code>$OSINKO</code> — treats a
          dividend as what it is once the stock lives onchain: a claim that can be proved, priced,
          advanced, streamed, reinvested, borrowed against and traded. The protocol holds stock
          tokens in custody, proves who was entitled to each dividend at its ex date, and routes
          the value according to one setting per position. Nothing about the share itself
          changes. The default product never wraps, rebases or re-issues it.
        </p>
        <p>
          Six modules share one balance sheet. <strong>Early</strong> pays a dividend at the ex date
          instead of the pay date, fronted by a USDG vault that earns a one percent fee.{" "}
          <strong>Stream</strong> turns the same entitlement into a per second flow. <strong>Reinvest</strong>{" "}
          swaps every claim straight back into the stock. <strong>Borrow</strong> draws USDG against the
          deposited stock, with the dividends applied to the interest first. <strong>Split</strong>{" "}
          separates a share into a principal token and a yield token, for holders who want the
          dividend itself to be a liquid position. And every action is exposed to an{" "}
          <strong>Agent</strong> over MCP, which can plan but never sign.
        </p>

        <Terms
          rows={[
            { term: "Stock token", def: <>An ERC-20 issued by Robinhood that tracks one listed share. 18 decimals. Osinko only ever calls <code>transfer</code>, <code>transferFrom</code>, <code>balanceOf</code> and <code>decimals</code> on it.</> },
            { term: "Ex date", def: "The second at which ownership is snapshotted. Whoever is on deposit in DripCore at this timestamp is entitled to the dividend, whatever happens afterwards." },
            { term: "Pay date", def: "When the issuer actually pays. Streams end here, and the vault is repaid here. Typically three weeks after the ex date." },
            { term: "Entitlement", def: <>What a holder is owed on one dividend: <code>balanceOfAt(ex) × amountPerToken</code>. Gross before the advance fee, net after it.</> },
            { term: "Mode", def: "A per position setting that decides what happens to each dividend: CASH_EARLY, STREAM or REINVEST. Captured at activation; changing it later never rewrites history." },
            { term: "Advance", def: "The vault paying a dividend before the issuer does. Booked as a receivable owed by the issuer and an obligation owed to the holder." },
            { term: "Stream", def: "A dividend paid out continuously from the ex date to the pay date. Claimable at any second; accounted lazily, so it costs one write to open and one per claim." },
            { term: "USDG", def: "The settlement asset. Every dividend, fee, advance and loan is denominated in it. Six decimals, and the code assumes so." },
            { term: "Series", def: "In Split: one (stock token, maturity) pair with its own principal and yield token, e.g. PT-MU / YT-MU maturing in ninety days." },
            { term: "Health factor", def: "In Borrow: collateral value × liquidation threshold ÷ debt. Above 1.00 the position is safe; ∞ when nothing is borrowed." },
          ]}
        />

        <Shot
          name="dashboard"
          n={1}
          alt="The Osinko dashboard: portfolio value, earned this week, active rules and the next ex date, above a META dividend awaiting its advance and two live streams."
          caption="The dashboard: two streams accruing per second, and a META dividend that went ex yesterday, waiting to be advanced. Every page in the app renders from the same data source, with or without a wallet."
        />

        <Sub id="aave-of-stocks" index="1.1" title="The Aave of stocks">
          <p>
            Aave is a money market. Anyone supplies an asset, anyone borrows against it, the
            interest rate is a function of how much of the pool is in use, and a health factor
            decides when a position is unwound. <strong>Osinko is the Aave of stocks</strong>: the same
            shape, built for tokenized equities and — specifically — for the income they pay.
            The comparison holds exactly where it matters and differs exactly where a stock is
            different from a token.
          </p>
          <Table
            head={["", "Aave", "Osinko"]}
            rows={[
              ["What you supply", "Crypto tokens", "Robinhood stock tokens, deposited into DripCore"],
              ["What funds the balance sheet", "The supplied assets themselves", "USDG from liquidity providers in the advance vault (ERC-4626)"],
              ["Where LP yield comes from", "Borrow interest", "The 1% advance fee first, borrow interest second"],
              ["The receivable", "Debt owed by borrowers", "Dividends owed by issuers at the pay date, plus loans once Borrow ships"],
              ["Collateral", "The supplied tokens", "The same deposited stock — which keeps earning while pledged"],
              ["Who pays the interest", "The borrower", "The collateral's own dividends, first; the borrower for any remainder"],
              ["Liquidation", "Health factor below 1", "Health factor below 1 at a 65% threshold; close factor 50%, bonus 5%"],
              ["Price source", "Chainlink", "Chainlink, 8 decimal USD feeds, 1 hour heartbeat, fails closed on stale"],
              ["Utilisation limit", "Rate curve discourages it", "A hard 80% cap on advances, contract enforced"],
            ]}
          />
          <p>
            The one thing without an Aave analogue is <em>time</em>. A dividend is owed for
            roughly three weeks between the ex date and the pay date, and that gap — a
            receivable from a known counterparty for a known amount on a known date — is the raw
            material for everything in sections 3 to 5. Aave lends against price. Osinko also
            lends against a calendar.
          </p>
          <Callout label="Two names, one claim">
            Elsewhere you will see Osinko called <em>the Aave of dividends</em>. It is the same claim
            seen from the other side: the stock is what you supply, and the dividend is what the
            market is built around. Aave is Finnish for ghost; osinko is Finnish for dividend.
          </Callout>
        </Sub>

        <Sub id="what-it-is-not" index="1.2" title="What Osinko is not">
          <ul>
            <li>
              <strong>Not a wrapper.</strong> Depositing does not mint a receipt token, an LP token or a
              rebasing derivative. Your position is a balance in DripCore, withdrawable at any
              time. Split (§7) is the single, opt in exception, and it says so on the tin.
            </li>
            <li>
              <strong>Not a snapshot of your wallet.</strong> Only stock deposited in DripCore before the
              ex date is eligible (§2.2). The protocol never reads external balances and never
              needs the token issuer to change anything.
            </li>
            <li>
              <strong>Not a new instrument.</strong> No synthetic dividend, no promise beyond the issuer's
              own. The same dividend, routed differently: early, continuously, into more stock,
              against interest, or as a token.
            </li>
            <li>
              <strong>Not leveraged by default.</strong> Borrow is a choice, capped at 40% loan to value,
              and a holder who never opens a line carries no debt and no liquidation risk.
            </li>
            <li>
              <strong>Not a custodian of keys.</strong> The web app builds transactions for your wallet.
              The MCP server and the agent console return unsigned calldata and cannot broadcast
              anything (§13).
            </li>
          </ul>
          <Shot
            name="certificate"
            n={2}
            alt="An engraved Osinko share certificate for one hundred and fifty shares of Apple Inc, with a dividend coupon of $39.00 attached along a perforation and an ex date stamp."
            caption="The object the product replaces: a share certificate with a dividend coupon along a perforation. Osinko keeps the certificate whole and acts on the coupon — the perforation is the ex date."
          />
        </Sub>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Custody and eligibility                                          */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="custody"
        index="2"
        title="Custody and eligibility"
        kicker="Every flow starts in DripCore. It holds the stock, proves who was owed what, and routes the money."
      >
        <p>
          <code>DripCore</code> is the one contract a holder interacts with directly. It takes
          custody of stock tokens, keeps a timestamped history of every balance, computes
          entitlements from that history when a dividend is activated, and hands the value to
          the module the holder's mode selects. The life of one dividend runs left to right
          below; the rest of this section is the detail of each stage.
        </p>
        <Figure
          n={3}
          caption="The life of one dividend. Deposits before the ex date are eligible. Between the ex date and the pay date the entitlement is either paid at once (Early) or accrues as a stream. At the pay date the issuer settles and the vault is repaid; a voided dividend branches into clawback instead."
        >
          <TimelineFigure />
        </Figure>

        <Sub id="deposit" index="2.1" title="Deposit">
          <p>
            Approve <code>DripCore</code> to spend the stock token, then call{" "}
            <code>deposit(stockToken, amount)</code>. The contract pulls the tokens, credits your
            position, and writes a checkpoint at the current timestamp. The first deposit of a
            token also writes the mode explicitly — <code>STREAM</code> by default, with a{" "}
            <code>ModeSet</code> event, so the default is on the record rather than implied.
          </p>
          <p>
            <code>withdraw(stockToken, amount)</code> returns tokens at any time. It reduces
            eligibility for dividends whose ex date has not yet passed; a dividend that already
            went ex while the tokens were on deposit stays yours, because the entitlement is read
            from the checkpoint at the ex date, not from the balance today.
          </p>
          <Code title="The two transactions a deposit takes" lang="typescript">{`import { buildApprove, buildDeposit, parseStock } from "@drip-markets/sdk";

const amount = parseStock("25");            // 25 AAPL, 18 decimals
const approve = buildApprove(AAPL, deployment.dripCore, amount, "AAPL");
const deposit = buildDeposit(deployment, AAPL, amount, "AAPL");
// Both are { to, data, value, description } — unsigned, for the holder's wallet.`}</Code>
          <Params
            rows={[
              { name: "Supported tokens", value: "Plain ERC-20, 18 dp", note: "Fee on transfer and rebasing tokens are not supported: DripCore credits the amount requested, not the amount received." },
              { name: "Position record", value: "{ amount, mode, initialized }", note: "One per holder per token. tokensOf(holder) lists every token a holder has ever deposited, which is what drives the portfolio view." },
              { name: "Pause", value: "DEFAULT_ADMIN_ROLE", note: "Pausing stops deposits, withdrawals, activations and settled claims. Streams already open keep accruing." },
            ]}
          />
        </Sub>

        <Sub id="checkpoint" index="2.2" title="The ex date checkpoint">
          <p>
            <strong>Only tokens deposited in DripCore before the ex date are eligible.</strong> This is the
            decision that shapes the whole protocol, and it is stated in capitals in the
            developer handoff for that reason.
          </p>
          <p>
            Every deposit, withdrawal, reinvest credit and clawback seizure writes a checkpoint
            (OpenZeppelin <code>Checkpoints.Trace208</code>, keyed by block timestamp) for the holder
            and for the token's protocol wide total. <code>balanceOfAt(holder, token, exDate)</code>{" "}
            is therefore a provable, onchain answer to “how much did this holder have at that
            second”, and it is the only input to the entitlement:
          </p>
          <Formula note="amountPerToken is USDG (6 decimals) per one whole token (1e18). A deposit landing in the same second as the ex date counts; a withdrawal one second later does not matter.">
            gross = balanceOfAt(holder, token, exDate) × amountPerToken ÷ 1e18{"\n"}
            net   = gross − gross × advanceFeeBps ÷ 10 000
          </Formula>
          <Figure
            n={4}
            caption="A balance stepping through two deposits and a withdrawal. The ex date falls while the balance is 150, so the entitlement is 150 × $0.26 = $39.00 gross, $38.61 net — exactly the AAPL stream in Fig. 1. The withdrawal afterwards changes nothing."
          >
            <CheckpointFigure />
          </Figure>
          <p>
            Why: the protocol then works with any plain ERC-20 stock token, needs no change to a
            token it does not control, no <code>ERC20Snapshot</code>, no merkle drop from an offchain
            indexer, and no trust in anything but its own storage. Cost: holders opt in by
            depositing, and the app says so everywhere it can.
          </p>
          <Callout label="Do not improve this">
            Wallet snapshotting would require redesigning eligibility, settlement and clawback
            together. Everything downstream — the vault's receivable, the stream's total, the
            settlement pull — is computed from these checkpoints and nothing else.
          </Callout>
        </Sub>

        <Sub id="modes" index="2.3" title="Modes">
          <p>
            One setting per position decides what a dividend becomes. It is read at activation
            and captured into the entitlement, so a mode change affects the next dividend, never
            one already in flight.
          </p>
          <Table
            head={["Mode", "What happens", "When the cash moves", "Fee"]}
            rows={[
              ["CASH_EARLY", "The whole net entitlement is paid to the wallet at activation", "At the ex date, in one transfer", "1% advance fee"],
              ["STREAM", "A stream opens for the net entitlement", "Every second from ex date to pay date, pulled on claim", "1% advance fee"],
              ["REINVEST", "The same stream, but every claim is swapped into the stock and credited back", "Every second; each claim lands as stock, not cash", "1% advance fee plus swap slippage"],
            ]}
            mono={[0]}
          />
          <p>
            A holder who never activates at all can still take a dividend the slow way after
            settlement, at face value and with no fee (§8). The fee is the price of time, and a
            holder who does not want the time does not pay it.
          </p>
          <Shot
            name="deposit-modes"
            n={5}
            alt="The mode picker on the deposit page: Cash early, Stream and Reinvest, each with a one line description."
            caption="Step three of the deposit flow. Mode is set per token, not per dividend — the same rule applies to every dividend that stock pays until the holder changes it."
          />
        </Sub>

        <Sub id="activation" index="2.4" title="Activation">
          <p>
            <code>activate(dividendId, holder)</code> routes a declared dividend for one holder. It is{" "}
            <strong>permissionless on purpose</strong>: a keeper, the holder, the UI or an agent can all
            call it, because the money can only ever go to the holder or to the reinvestor acting
            for them. <code>activateBatch</code> does the same for a list of holders and skips the
            impossible instead of reverting.
          </p>
          <ol>
            <li>The dividend must be <code>DECLARED</code>, and the clock must read at or after its ex date and before its pay date.</li>
            <li>The entitlement is computed from the checkpoint at the ex date. Zero reverts as <code>NothingEligible</code>.</li>
            <li>The vault books the gross as a receivable and recognises the fee (§3). The holder is now owed the net.</li>
            <li>In <code>CASH_EARLY</code> the vault releases the whole net amount to the wallet now. In <code>STREAM</code> and <code>REINVEST</code> a stream opens for the net, from the ex date to the pay date (§4).</li>
          </ol>
          <Params
            rows={[
              { name: "Window", value: "exDate ≤ now < payDate", note: "BeforeExDate and AfterPayDate revert. After the pay date the settled path (§8) takes over." },
              { name: "Once per holder per dividend", value: "AlreadyActivated", note: "The entitlement record carries activated, claimed and clawedBack flags; each path checks the others." },
              { name: "Events", value: "EntitlementCreated · EntitlementActivated", note: "Indexed by holder and dividend id. The activity feed in the app is built from these." },
            ]}
          />
        </Sub>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Early                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="early"
        index="3"
        title="Early — the advance vault"
        kicker="A dividend is a receivable from a known counterparty for a known amount on a known date. That is what a vault is for."
      >
        <p>
          When a holder activates, the <code>AdvanceVault</code> has fronted money the issuer will
          pay weeks later — all of it at once for <code>CASH_EARLY</code>, or as fast as a stream is
          claimed for the other two modes. The one percent fee is the price of that time, and it
          is the yield the vault's liquidity providers earn. The vault is an ERC-4626 vault of
          USDG, and everything about it reduces to one identity:
        </p>
        <Formula note="cash is USDG in the vault. receivables is gross dividend the issuers still owe at settlement. obligations is net dividend the vault still owes to holders who advanced.">
          totalAssets = cash + receivables − obligations
        </Formula>
        <Figure
          n={6}
          caption="The balance sheet as four bars, with stylised numbers. Booking an advance adds gross to receivables and net to obligations, so assets rise by exactly the fee the moment the risk is taken. Every later step is assets neutral; only fees and losses move the share price."
        >
          <VaultFigure />
        </Figure>
        <Table
          head={["Operation", "Cash", "Receivables", "Obligations", "Assets"]}
          rows={[
            ["bookAdvance(gross)", "—", "+ gross", "+ gross − fee", "+ fee"],
            ["releaseAdvance(amount)", "− amount", "—", "− amount", "neutral"],
            ["repayAdvance(amount)", "+ amount", "− amount", "—", "neutral"],
            ["recordLoss(amount)", "—", "− amount", "—", "− amount, LPs absorb it"],
            ["cancelObligation(amount)", "—", "—", "− amount", "+ amount"],
          ]}
          mono={[0, 1, 2, 3]}
        />
        <p>Two admission checks run on every booking, and either failing reverts the activation:</p>
        <ul>
          <li>
            <strong>Cash floor.</strong> <code>cash ≥ obligations</code> after booking. Every holder the vault
            has promised money to is payable today, so a claim mid stream can never fail for lack
            of funds.
          </li>
          <li>
            <strong>Utilisation cap.</strong> <code>receivables ≤ 80%</code> of assets after booking. The vault
            is never fully lent out; the admin ceiling on this parameter is 95%.
          </li>
        </ul>
        <Params
          rows={[
            { name: "Advance fee", value: "100 bps · ceiling 500", note: "Recognised at booking, not at repayment. The only fee in the income side of the protocol." },
            { name: "Utilisation cap", value: "8 000 bps · ceiling 9 500", note: "Bounds the worst case a dishonest oracle can extract to 80% of vault assets (§9)." },
            { name: "Settlement window", value: "≤ 90 days", note: "MAX_SETTLEMENT_WINDOW in the registry caps how long a receivable can be outstanding." },
            { name: "Share inflation guard", value: "_decimalsOffset = 3", note: "A virtual share offset on top of OpenZeppelin's ERC-4626 kills the first depositor attack." },
            { name: "LP withdrawal", value: "bounded by freeCash", note: "freeCash = cash − obligations. Capital fronting a dividend is illiquid until the issuer settles; everything else leaves on request." },
            { name: "Pause", value: "blocks deposits and withdrawals", note: "Including LP exit. That is the intended emergency posture, flagged for audit." },
          ]}
        />
        <Shot
          name="vault"
          n={7}
          alt="Vault statistics: total value locked, current APY, utilisation against an 80 percent cap, and advances outstanding."
          caption="The vault page. Utilisation is drawn against its cap; the APY is the fee income annualised on assets. Once Borrow ships, borrow interest joins the fee as LP yield (§6)."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Stream                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="stream"
        index="4"
        title="Stream"
        kicker="A quarterly lump is an accounting choice. Per second accrual is cheaper to compute than the batch."
      >
        <p>
          The <code>StreamEngine</code> turns a net entitlement into a flow from the ex date to the pay
          date. The accounting is lazy: nothing is pushed per block, and what is claimable is a
          pure function of elapsed time, so a stream costs one storage write to open and one per
          claim. Superfluid style constant flow math, without the dependency.
        </p>
        <Formula note="Integer math over 6 decimal USDG. The rate is exposed scaled by 1e18 (ratePerSecondScaled) so a UI can interpolate between blocks without rounding to zero.">
          accrued(t)  = total × (t − start) ÷ (end − start), capped at total{"\n"}
          claimable   = accrued(now) − claimed
        </Formula>
        <Figure
          n={8}
          caption="The MSFT stream from Fig. 1: 220 shares × $0.83 × 0.99 = $180.77 over 21 days. Accrued rises in a straight line; claimed is a staircase beneath it; the gap is what a claim pays right now. Nothing is lost by waiting and nothing is gained by claiming often."
        >
          <StreamFigure />
        </Figure>
        <ul>
          <li>
            <code>claim(streamId)</code> pays everything accrued to the stream's owner. Only the owner may
            call it.
          </li>
          <li>
            <code>claimFor</code> and <code>claimBatch</code> let a <code>KEEPER_ROLE</code> push money on a
            holder's behalf — always to the holder, or to the reinvestor acting for them, never to
            the keeper. Batches skip streams with nothing accrued instead of reverting.
          </li>
          <li>
            Each claim pulls its cash from the vault through <code>releaseAdvance</code>, which is why the
            cash floor in §3 matters: the vault must be able to honour every open stream today.
          </li>
          <li>
            A stream closes when it is fully drawn after the pay date, or when the dividend is
            voided and DripCore cancels it (§8). <code>StreamClosed</code> says which.
          </li>
        </ul>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Reinvest                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="reinvest"
        index="5"
        title="Reinvest"
        kicker="Robinhood reinvests the trading day after the pay date, during market hours, into a fraction that cannot leave the app. A pool does not keep office hours."
      >
        <p>
          In <code>REINVEST</code> mode a claim does not stop at the wallet. The stream engine sends the
          USDG to the <code>Reinvestor</code>, which swaps it for the stock token that paid the dividend
          and credits the result back into the holder's DripCore position through{" "}
          <code>creditReinvest</code> — the one path allowed to grow a position without a deposit. The
          credit writes a checkpoint, so the next ex date sees a larger balance. The loop closes in
          the same transaction as the claim.
        </p>
        <ol>
          <li>The holder (or a keeper) claims a REINVEST stream. The vault releases the accrued USDG to the Reinvestor.</li>
          <li>The Reinvestor quotes the swap against the price oracle, not the pool, and sets a minimum output from the holder's slippage tolerance.</li>
          <li>The swap adapter executes USDG → stock. A fill worse than the bound reverts the whole claim rather than filling badly.</li>
          <li>DripCore credits the stock to the position and checkpoints it. <code>Reinvested</code> is emitted with tokens out and the new balance.</li>
        </ol>
        <Params
          rows={[
            { name: "Slippage tolerance", value: "100 bps default · ceiling 1 000", note: "Per holder, via setMaxSlippage. Zero is rejected; so is anything over ten percent." },
            { name: "Quote source", value: "IPriceOracle, never the pool", note: "The reference price must come from a feed the trade itself cannot move inside one block. On mainnet that is ChainlinkPriceOracle (§12)." },
            { name: "Swap venue", value: "ISwapAdapter", note: "UniswapV3SwapAdapter in production: SwapRouter02 semantics, USDG → token leg only, minimum output bounded against the feed. A mock adapter stands in for local development." },
            { name: "Cross token reinvestment", value: "Not supported, by design", note: "AAPL dividends buy AAPL. A holder who wants something else sets CASH_EARLY and buys it themselves — two steps they can see." },
          ]}
        />
        <Table
          head={["", "Brokerage DRIP today", "Osinko"]}
          rows={[
            ["Reinvestment", "Trading day after the pay date", "The same transaction as the claim"],
            ["Hours", "Market hours, midnight cutoff", "Every second of every day"],
            ["Fractional shares", "Locked inside one app", "Self custodied ERC-20, credited to your position"],
            ["Cash timing", "Pay date, weeks after ex", "Ex date, minus one percent"],
            ["Cadence", "A quarterly lump", "A continuous stream"],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Borrow                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="borrow"
        index="6"
        title="Borrow"
        kicker="Once the stock lives onchain it can do what collateral has always done on Wall Street: back a loan. This is where the name comes from."
      >
        <Callout label="Status">
          Borrow is live in the app against the reference portfolio, backed by the same data
          source as every other page. The onchain market — a <code>LendingPool</code> alongside DripCore and the vault — is
          specified in the developer handoff and is the credit side's build item. The parameters
          below are that specification; the interface the app already uses is frozen around them.
        </Callout>
        <p>
          A holder draws USDG against stock already on deposit. Pledged collateral stays in
          DripCore, keeps its mode, and keeps earning; it is simply locked against withdrawal
          while it backs debt. The USDG comes from the same vault balance sheet that fronts
          dividends, so its accounting identity gains one term — <code>loansOutstanding</code>, a
          receivable from borrowers that mirrors the receivable from issuers — and liquidity
          providers earn borrow interest on top of advance fees.
        </p>
        <p>
          The Osinko twist is in the order money is applied. When the protocol realises dividend
          value for a borrower — an advance, a stream claim, a settlement — it is routed{" "}
          <strong>debt first</strong>: interest, then principal if the holder opted in, then whatever the
          position's mode says. At a conservative loan the collateral's own yield covers the
          whole rate, and the position carries itself.
        </p>
        <Figure
          n={9}
          caption="The loan to value scale. Up to 40% can be drawn. Between 40% and 65% nothing new can be borrowed and nothing is liquidated. Past 65% a liquidator may repay up to half the debt and take collateral plus a 5% bonus. The marker is this portfolio, live."
        >
          <LtvFigure ltvPct={ltvPct} healthFactor={credit.healthFactor} />
        </Figure>
        <Params
          rows={[
            { name: "Maximum loan to value", value: "40%", note: "The hard borrow cap. Far below the liquidation line on purpose: the buffer is what lets a dividend serviced loan ride out a drawdown." },
            { name: "Liquidation threshold", value: "65%", note: "health factor = collateral × 0.65 ÷ debt. Below 1.00 the position is liquidatable." },
            { name: "Close factor · bonus", value: "50% · 5%", note: "A liquidator repays up to half the debt and takes collateral worth that plus five percent, sold through the swap adapter with an oracle bounded minimum." },
            { name: "Borrow rate", value: "kinked, 2% base → 8% at 80%", note: "A utilisation curve in the Aave shape: slope one to the kink, steep past it. The market shows 5.8% today." },
            { name: "Servicing order", value: "interest → principal → mode", note: "One hook in DripCore's entitlement flow. A stale price freezes new borrows and blocks liquidations; nothing is ever liquidated on a stale feed." },
            { name: "Invariants to test", value: "4", note: "debt ≤ collateral × threshold at action time; cash + receivables + loans ≥ obligations; servicing never takes principal below zero; a stale oracle can never mint debt." },
          ]}
        />
        <p>The portfolio in the app, as it stands right now, in the same terms:</p>
        <Params
          rows={[
            { name: "Collateral at Chainlink prices", value: `$${fmt(credit.collateralValueUsd, 0)}` },
            { name: "Borrowed", value: `$${fmt(credit.borrowedUsd, 0)} of $${fmt(credit.maxBorrowUsd, 0)} available` },
            { name: "Loan to value · health factor", value: `${ltvPct.toFixed(1)}% · ${Number.isFinite(credit.healthFactor) ? credit.healthFactor.toFixed(2) : "∞"}` },
            { name: "Dividends the collateral earns", value: `+$${fmt(credit.dividendsPerYearUsd)} / year` },
            { name: "Interest the debt costs", value: `−$${fmt(credit.interestPerYearUsd)} / year at ${credit.borrowAprPct.toFixed(1)}%` },
            {
              name: "Net carry",
              value: `${credit.netCarryPerYearUsd >= 0 ? "+" : "−"}$${fmt(Math.abs(credit.netCarryPerYearUsd))} / year`,
              note: credit.netCarryPerYearUsd >= 0 ? "The dividends out earn the interest. The loan carries itself." : "Interest exceeds dividend income; the gap accrues to the debt.",
            },
          ]}
        />
        <Shot
          name="borrow"
          n={10}
          alt="The borrow page: collateral, borrowed, health factor with a meter to the 65 percent liquidation line, net carry per year, and a live counter of interest serviced by dividends."
          caption="The credit side. The page leads with net carry — what the collateral's dividends earn against what the debt costs — and the counter of interest already serviced by dividends ticks per second."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 7. Split                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="split"
        index="7"
        title="Split — principal and yield"
        kicker="Early, Stream, Reinvest and Borrow never wrap the share. Split is the exception, and it is opt in."
      >
        <p>
          <code>SplitVault</code> separates a stock token into two ERC-20s. The{" "}
          <strong>Principal Token</strong> is the share minus the drip: it redeems one for one for the
          stock at maturity and nothing else. The <strong>Yield Token</strong> is the drip on its own: a
          claim on every dividend the stock pays before maturity, and nothing else. Sold apart,
          the two price the dividend stream separately from the share — the Pendle shape, for
          equities. Held together, they can always be merged back into the whole token, free, at
          any time.
        </p>
        <Figure
          n={11}
          caption="One stock token becomes 0.9990 PT and 0.9990 YT after the 10 basis point split fee. PT redeems for stock at maturity. YT collects each harvested dividend pro rata to whoever held it at that dividend's ex date. Equal PT and YT merge back to the whole token, free, before or after maturity."
        >
          <SplitFigure />
        </Figure>
        <p>
          The mechanism in one line: <code>SplitVault</code> deposits into <code>DripCore</code> under its own
          address, in <code>CASH_EARLY</code> mode, and becomes an ordinary holder like anyone else. A
          harvest is a normal activation from DripCore's point of view — subject to the vault's
          cash floor and utilisation cap exactly like any other holder's advance, with no special
          casing — and the USDG it produces can only ever land in the split vault's own pool.
        </p>
        <Table
          head={["Function", "Who", "What it does"]}
          rows={[
            ["createSeries(stock, maturity)", "KEEPER_ROLE", "Opens a series and deploys its PT and YT. Reverts while the prior series on the same stock still has PT outstanding."],
            ["split(seriesId, amount)", "Anyone", "Deposits stock, keeps the fee, deposits the rest into DripCore, mints equal PT and YT. Blocked after maturity."],
            ["merge(seriesId, amount)", "Anyone", "Burns equal PT and YT, withdraws the stock from DripCore, returns it. No fee, before or after maturity."],
            ["redeemPrincipal(seriesId, amount)", "Anyone, after maturity", "Burns PT alone for the underlying stock."],
            ["harvestDividend(seriesId, dividendId)", "Anyone", "Activates the series' entitlement on a dividend that has gone ex and books the net USDG into the pool, recording YT supply at the ex date."],
            ["claimYield(seriesId, dividendId)", "YT holder", "Pays pool × balanceOfAt(holder, exDate) ÷ totalSupplyAt(exDate). Once per holder per dividend."],
            ["setSplitFeeBps(bps)", "DEFAULT_ADMIN_ROLE", "Sets the fee, capped at MAX_SPLIT_FEE_BPS = 100."],
          ]}
          mono={[0]}
        />
        <Callout label="The load bearing simplification">
          One active series per stock token. A new series cannot open until the prior one's
          principal supply is redeemed to zero. That keeps{" "}
          <code>dripCore.balanceOf(splitVault, stock) == PT.totalSupply()</code> true at every moment,
          which is what makes the accounting provable without a second layer of cross series
          proration. Concurrent maturities on one stock — Pendle runs several expiries per asset —
          need a per series sub account that itself deposits into DripCore. It is the first thing
          the handoff tells the next developer to build.
        </Callout>
        <ul>
          <li>
            <strong>Yield is paid to the right holder.</strong> <code>YieldToken</code> checkpoints every
            transfer the same way DripCore checkpoints deposits, so a dividend harvested after a YT
            changed hands still pays whoever held it at that dividend's ex date. A transfer after
            the ex date cannot change what a dividend pays — tested, and worth an invariant.
          </li>
          <li>
            <strong>The fee never enters DripCore.</strong> Fee stock is held in the vault rather than
            deposited, so principal supply never has to account for stock that is not backing a PT.
          </li>
          <li>
            <strong>YT decays to zero at maturity, not before.</strong> Splitting after maturity is blocked
            (<code>AlreadyMatured</code>) since it would mint a yield token with nothing left to accrue;
            merging is always allowed, because burning PT and YT for stock is harmless whenever it
            happens.
          </li>
          <li>
            <strong>There is no AMM yet.</strong> The “implied yield” the app shows is the stock's
            annualised dividend yield, not a market price. A real PT/YT market is the trade half
            of the pitch and the highest leverage thing to build next.
          </li>
        </ul>
        <Shot
          name="split"
          n={12}
          alt="The split page: principal held, yield held, a countdown to maturity, implied yield, a harvested MU dividend with claimable yield, and a split, merge, redeem panel."
          caption="The MU series, ninety days from maturity, with a dividend that went ex four days ago sitting harvestable. Harvest is permissionless; claim pays pro rata by the yield token's own transfer history."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 8. Settlement and clawback                                          */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="settlement"
        index="8"
        title="Settlement and clawback"
        kicker="The vault's receivable is only as good as the issuer's payment. Here is what happens when it arrives, and when it does not."
      >
        <Figure
          n={13}
          caption="The registry's state machine. An oracle declares; the settlement keeper pays and the dividend is settled; or the oracle voids it and every activated holder is clawed back."
        >
          <LifecycleFigure />
        </Figure>
        <p>
          <strong>Settlement.</strong> At the pay date, <code>DripCore.settleDividend(dividendId)</code> — callable
          by <code>KEEPER_ROLE</code>, the settlement pipe on production — pulls the full eligible amount
          from the caller in one transfer:
        </p>
        <Formula note="Computed from the protocol wide checkpoint at the ex date, so it covers every eligible holder whether or not they activated. This is the only place real dividend cash enters the protocol.">
          totalEntitlement = totalDepositedAt(stock, exDate) × amountPerToken ÷ 1e18
        </Formula>
        <p>
          Of that, the vault's receivable on the dividend is repaid first (<code>repayAdvance</code>). The
          remainder is parked in DripCore for holders who never activated, who may take it with{" "}
          <code>claimSettled</code> at face value and with no fee. DripCore holds <code>SETTLER_ROLE</code> on
          the registry and marks the dividend <code>SETTLED</code>.
        </p>
        <p>
          <strong>Void.</strong> If the issuer cancels, the oracle calls <code>voidDividend(id, reason)</code> and a
          keeper runs <code>clawback(dividendId, holder)</code> for each holder who activated:
        </p>
        <ol>
          <li>Cancel the undrawn part of the stream and the matching vault obligation. Money not yet paid is simply never paid.</li>
          <li>Seize deposited stock worth the cash actually paid out, priced by the price oracle, and hand it to the vault (<code>receiveClawback</code>) for admin liquidation.</li>
          <li>Write off whatever could not be recovered as a loss (<code>recordLoss</code>). Liquidity providers absorb it; the fee is what they are paid for.</li>
        </ol>
        <Callout label="Production hardening, listed in the handoff">
          Price the seizure from the oracle rather than the venue; decide how to treat a holder who
          withdrew between activation and the void (a short withdrawal delay on positions with a
          live advance, or an insurance sliver of the fee, before anything heavier); automate or
          timelock collateral liquidation; and fuzz a void landing mid claim. The sequence is safe
          today — cancel before seize — and deserves its own campaign.
        </Callout>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 9. Roles and trust                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="roles"
        index="9"
        title="Roles and trust"
        kicker="Only protocol contracts move protocol money. Human held roles feed data, pay money in, or push it to its rightful owner."
      >
        <Table
          head={["Role", "Where", "Holder today", "Holder in production"]}
          rows={[
            ["DEFAULT_ADMIN_ROLE", "everywhere", "deploy key", "multisig behind a timelock"],
            ["ORACLE_ROLE", "DividendRegistry", "deploy key", "dividend oracle reading issuer corporate action data"],
            ["SETTLER_ROLE", "DividendRegistry", "DripCore (contract)", "DripCore, unchanged"],
            ["KEEPER_ROLE", "DripCore", "deploy key", "settlement pipe and ops bot: settleDividend, clawback"],
            ["KEEPER_ROLE", "StreamEngine", "deploy key", "batch claim bot; can only push money to holders"],
            ["KEEPER_ROLE", "SplitVault", "deploy key", "series opener and pause switch"],
            ["CORE_ROLE", "AdvanceVault · StreamEngine · Reinvestor", "protocol contracts", "unchanged, contracts only"],
            ["REINVESTOR_ROLE", "DripCore", "Reinvestor (contract)", "unchanged"],
          ]}
          mono={[0]}
        />
        <p>
          No role can redirect a holder's funds to a third party. The wiring in{" "}
          <code>script/Deploy.s.sol</code> is canonical and the test base mirrors it; the two are kept in
          step. Trust assumptions, ranked by how much damage a failure could do:
        </p>
        <ol>
          <li>
            <strong>The oracle.</strong> A dishonest <code>ORACLE_ROLE</code> can declare a dividend that will
            never settle and drain advances up to the utilisation cap, or void a real dividend and
            trigger clawbacks. Mitigations before launch: a multisig oracle, the delay between
            declaration and ex date that is already structurally present, a bond, and the cap
            itself, which bounds the worst case at 80% of vault assets.
          </li>
          <li>
            <strong>Issuer settlement.</strong> The receivable is only as good as the payment at the pay
            date. On Robinhood Chain the issuer leg is Robinhood itself; the clawback path exists
            for the residual.
          </li>
          <li>
            <strong>Admin keys.</strong> Pause, fee (≤ 5%), cap (≤ 95%), swap adapter pointer, collateral
            liquidation, split fee (≤ 1%). All belong behind a timelock in production.
          </li>
          <li>
            <strong>Price source.</strong> For reinvestment and clawback sizing, the slippage reference must
            come from a feed the trade cannot move inside one block. Never quote the pool you are
            about to trade against.
          </li>
        </ol>
        <Callout label="Upgradeability">
          Version one is immutable: no proxies. If something must change, a v2 is deployed, v1's
          user entry points are paused, and holders withdraw and redeposit — positions are plain
          balances, so migration is mechanical. Every contract is AccessControl based and could
          convert to UUPS, at the cost of storage layout discipline and an upgrade key to protect.
          The recommendation is immutable, with the migration path documented to users.
        </Callout>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 10. Risks                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Section id="risks" index="10" title="Risks" kicker="Stated rather than implied. A product that hides its failure modes has not thought about them.">
        <ul>
          <li>
            <strong>Oracle risk.</strong> The registry is the source of truth for what is owed. A wrong or
            malicious declaration is the largest single exposure in the system (§9).
          </li>
          <li>
            <strong>Counterparty risk.</strong> An advance is a bet that the issuer pays at the pay date. If
            it does not, clawback recovers what it can from the advanced holders' collateral and
            liquidity providers absorb the rest.
          </li>
          <li>
            <strong>Liquidity risk for LPs.</strong> Capital fronting a dividend is locked until settlement.
            Withdrawals are bounded by free cash, and a pause blocks LP exit.
          </li>
          <li>
            <strong>Market risk in Borrow.</strong> Collateral is priced by Chainlink. A fall past the 65%
            threshold makes the position liquidatable; the 40% borrow cap is the buffer.
          </li>
          <li>
            <strong>Market risk in Split.</strong> PT and YT are volatile, market priced tokens once a
            market exists, and there is no market in this repository yet. A yield token is worth
            exactly the dividends still ahead of it and decays to zero at maturity.
          </li>
          <li>
            <strong>Smart contract risk.</strong> 96 tests, including handler driven invariants, and an audit
            checklist in the handoff — but no audit yet.
          </li>
          <li>
            <strong>Chain and token risk.</strong> Robinhood Chain is an Arbitrum Orbit L2, public since
            February 2026. The stock tokens are Robinhood issued trackers; the listing rules require
            a live receive, hold and transfer test from a contract before real capital touches one.
          </li>
        </ul>
        <p>Three invariants are enforced by the test suite and must survive any change:</p>
        <Formula note="Plus a test that fails loudly if the invariant handler ever stops reaching deep states — a green suite that tests nothing is the failure mode to fear.">
          1. cash ≥ obligations, and utilisation ≤ cap, always{"\n"}
          2. claimed ≤ total per stream; stream totals equal the booked net entitlements{"\n"}
          3. Σ positions == token.balanceOf(DripCore) == totalDeposited, per token
        </Formula>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 11. Architecture                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="architecture"
        index="11"
        title="Architecture and contracts"
        kicker="Ten contracts, one balance sheet. The frontend, SDK and agent read state only through the interfaces and events listed here."
      >
        <Figure
          n={14}
          caption="Where the money goes. An oracle declares into the registry; a holder deposits stock into DripCore; DripCore books advances with the vault and opens streams; streams pay the wallet or the reinvestor, which buys stock and credits it back. SplitVault sits on the same balance sheet as an ordinary holder; LendingPool is specified but not yet deployed."
        >
          <ArchitectureFigure />
        </Figure>
        <Table
          head={["Contract", "Purpose", "Notes"]}
          rows={[
            ["DividendRegistry", "Calendar and lifecycle: DECLARED → SETTLED | VOIDED", "ORACLE_ROLE declares and voids; SETTLER_ROLE (DripCore) marks settled. 90 day settlement window."],
            ["DripCore", "Custody, checkpoints, entitlements, routing, settlement, clawback", "The one contract holders call. Pausable. Reentrancy guarded on every token moving entry point."],
            ["AdvanceVault", "ERC-4626 USDG vault that fronts dividends and earns the fee", "Cash floor, 80% utilisation cap, virtual share offset of 3."],
            ["StreamEngine", "Lazy per second streams over the ex → pay window", "One write to open, one per claim. Keeper batch claims push money only to holders."],
            ["Reinvestor", "Claim → swap → credit back, per holder slippage guard", "Oracle quoted, venue executed. Cross token routing deliberately absent."],
            ["SplitVault", "Series lifecycle, PT/YT issuance, harvest and claim", "A DripCore holder under its own address. One active series per stock token."],
            ["PrincipalToken · YieldToken", "Per series ERC-20s, mint and burn gated to the vault", "YieldToken checkpoints every transfer for ex date accurate yield."],
            ["ChainlinkPriceOracle", "8 decimal USD feeds scaled to the 6 decimal USDG quote", "1 hour heartbeat. Fails closed on stale, zero, negative or incomplete rounds."],
            ["UniswapV3SwapAdapter", "SwapRouter02 execution of the USDG → token leg", "Minimum output bounded against the feed, never the mid leg. Production only."],
            ["Mocks", "MockStockToken, MockUSDG, MockSwapAdapter, MockPriceOracle", "Local development only, with faucets. Deleted from the production deployment."],
          ]}
          mono={[0]}
        />
        <p>
          The event surface below is what the app, SDK and MCP server index. Signatures are frozen:
          additive changes are fine, breaking ones are not. The SDK's ABIs and address books are
          regenerated from the compiled contracts by <code>scripts/sync-abis.mjs</code>.
        </p>
        <Code title="Events the frontend depends on" lang="solidity">{`DividendRegistry  DividendDeclared · DividendSettled · DividendVoided · SupportedTokenAdded
DripCore          Deposited · Withdrawn · ModeSet · EntitlementCreated · EntitlementActivated
                  SettledDividendFunded · SettledEntitlementClaimed · Reinvested · ClawedBack
AdvanceVault      AdvancePaid · AdvanceReleased · AdvanceRepaid · FeeAccrued · LossRecorded
                  CollateralClawedBack
StreamEngine      StreamStarted · StreamClaimed · StreamClosed
Reinvestor        Reinvested · SlippageSet · SwapAdapterSet
SplitVault        SeriesCreated · Split · Merged · PrincipalRedeemed · DividendHarvested
                  YieldClaimed · SplitFeeSet`}</Code>
        <Code title="Repository map" lang="text">{`contracts/src/            ten protocol contracts + interfaces + mocks + adapters
contracts/test/           unit + integration suites, one per contract
contracts/test/invariant/ handler driven invariant suite
contracts/script/         Deploy.s.sol (writes deployments/<chainid>.json), Seed.s.sol, VerifyUniverse.s.sol
contracts/listings/       4663.json — the mainnet listing universe, verified onchain before wiring
scripts/                  deploy-local.sh, sync-abis.mjs
packages/sdk/             viem SDK: typed reads (DripReader), unsigned write builders, listings
packages/mcp/             MCP server: 4 read tools, 3 write tools, no keys, stdio
apps/web/                 Next.js app — landing, dashboard, deposit, borrow, split, vault, calendar, agent, docs
HANDOFF.md                for the Solidity developer taking this to mainnet`}</Code>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 12. Universe and oracles                                            */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="universe"
        index="12"
        title="Universe and oracles"
        kicker="A name without a feed is not listed. There is no manual price anywhere in this system."
      >
        <p>
          The listing universe is maintained by hand in <code>contracts/listings/4663.json</code>, verified
          onchain by <code>VerifyUniverse.s.sol</code> before every wiring change, and exported typed from
          the SDK as <code>listings</code> so every consumer reads the same table. Sixteen Robinhood stock
          tokens are recorded; fifteen are enabled. SPCX is present but disabled — never traded, a
          private company feed — and so never appears anywhere in the app.
        </p>
        <ol>
          <li><strong>No feed, no listing.</strong> A token without a Chainlink USD feed on this chain is never added, whatever its volume.</li>
          <li><strong>Verify onchain before wiring.</strong> Token <code>symbol()</code> and <code>decimals()</code>, feed <code>description()</code>, feed liveness. Hard fail on any mismatch.</li>
          <li><strong>Quote every route</strong> through QuoterV2 before enabling it; re-check the 3000 fee tier per pool.</li>
          <li><strong>Path encoding</strong> is <code>WETH → USDG → token</code> at 3000 tiers; the minimum output bounds the final token against the Chainlink price, never the mid leg.</li>
          <li><strong>Fail closed on stale.</strong> All feeds are 8 decimal USD via <code>latestRoundData()</code>. A round older than the one hour heartbeat, or reporting zero, halts pricing for that name rather than guessing.</li>
          <li><strong>Test the token itself.</strong> Stock tokens are Robinhood issued trackers: run a live small receive, hold and transfer test from a contract before real capital.</li>
        </ol>
        <Table
          head={["Token", "Name", "Price", "Yield", "Next ex", "Route status"]}
          align={[2, 3, 4]}
          rows={universe.map((t) => {
            const view = tokens.find((v) => v.symbol === t.symbol);
            return [
              <span key={t.symbol} className="flex items-center gap-2.5">
                <TokenMark symbol={t.symbol} size={22} />
                <span className="font-semibold">{t.symbol}</span>
              </span>,
              view?.name ?? "—",
              <span key="p" className="num">{view ? `$${fmt(view.priceUsd)}` : "—"}</span>,
              <span key="y" className="num text-cyan-deep">{view && view.yieldPct > 0 ? `${view.yieldPct.toFixed(2)}%` : "—"}</span>,
              <span key="e" className="num">{view?.nextExDate ? shortDate(view.nextExDate) : view?.payingNow ? "paying now" : "—"}</span>,
              <span key="l" className="font-mono text-nano uppercase text-faint">{t.liquidity === "live" ? "live" : "quote first"}</span>,
            ];
          })}
        />
        <p>
          <em>live</em> means real protocol buys have executed through the route; <em>quote first</em>{" "}
          means the route quotes in the right tiers but no buy has been observed, so the adapter
          quotes through QuoterV2 before every trade. Prices and yields above come from the same
          source the app is on right now — the reference portfolio, or Chainlink when a wallet is connected.
        </p>
        <Shot
          name="universe"
          n={15}
          alt="The universe table on the landing page: fifteen tokens with price, dividend, yield, next ex date and streaming status, above the three listing rules."
          caption="The universe, sortable and filterable, on the landing page. Density is the point: a table of every listed name, priced, is the proof that the data exists."
        />
        <Table
          head={["Network", "Chain id", "RPC", "Role"]}
          rows={[
            ["Robinhood Chain", "4663", "https://rpc.mainnet.chain.robinhood.com", "The product's home. The listing universe and the production adapters are written against it."],
            ["Anvil", "31337", "http://127.0.0.1:8545", "Local development. deploy-local.sh deploys, seeds, fast forwards and syncs ABIs."],
          ]}
          mono={[1, 2]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 13. Agent and SDK                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="agent"
        index="13"
        title="Agent and SDK"
        kicker="One protocol, many clients, identical semantics. The agent can plan anything and sign nothing."
      >
        <p>
          The MCP server exposes the protocol to agents over stdio. Read tools call view functions
          and answer directly. Write tools <strong>never execute</strong>: they return an unsigned
          transaction payload for the user's own wallet to review and sign. The server holds no
          private key, takes no key configuration, and has no code path that could broadcast a
          transaction. The agent console in the app drives exactly the same intents, with a plan
          card that states what will change before anything moves.
        </p>
        <Table
          head={["Tool", "Kind", "What it returns"]}
          rows={[
            ["get_positions", "read", "Deposited positions for a holder: amount, USDG value, mode."],
            ["get_streams", "read", "Every stream for a holder: claimable now, total, claimed, window, mode, open or closed."],
            ["get_calendar", "read", "Every declared dividend with amount per share, ex date, pay date, status, and days paid early."],
            ["get_vault", "read", "Total assets, utilisation against the cap, advances outstanding, lifetime fees, share price."],
            ["set_mode", "write", "The unsigned transaction that changes a position's mode. Calldata only."],
            ["claim_stream", "write", "The unsigned transaction that claims everything a stream has accrued. Only the owner can execute it."],
            ["deposit", "write", "The unsigned approve and deposit transactions, in order."],
          ]}
          mono={[0, 1]}
        />
        <Code title="Every write comes back in one shape" lang="json">{`{
  "action": "sign_and_send",
  "summary": "Deposit 25 AAPL into Osinko",
  "note": "These transactions are unsigned. Present them to the user's wallet for review. This server cannot execute them.",
  "transactions": [
    { "to": "0xAAPL…", "data": "0x095ea7b3…", "value": "0x0", "description": "Approve AAPL for the protocol" },
    { "to": "0xDripCore…", "data": "0x47e7ef24…", "value": "0x0", "description": "Deposit AAPL into Osinko" }
  ]
}`}</Code>
        <Pair>
          <Code title="Point an MCP client at it" lang="json">{`{
  "mcpServers": {
    "osinko": {
      "command": "pnpm",
      "args": ["--filter", "@drip-markets/mcp", "start"],
      "env": {
        "DRIP_RPC_URL": "http://127.0.0.1:8545",
        "DRIP_CHAIN_ID": "31337"
      }
    }
  }
}`}</Code>
          <Code title="Read the chain with the SDK" lang="typescript">{`import { createPublicClient, http } from "viem";
import { DripReader } from "@drip-markets/sdk";

const client = createPublicClient({ transport: http(RPC) });
const reader = DripReader.forChain(client, 46630);

const positions = await reader.getPositions(holder);
const streams   = await reader.getStreams(holder);
const calendar  = await reader.getCalendar();
const vault     = await reader.getVaultStats();
// No backend, no indexer, no cached state. If the chain
// says it, the app shows it.`}</Code>
        </Pair>
        <p>
          The console's intent parser is deliberately small. It recognises a fixed set of phrasings
          — set a mode, claim, start an advance, deposit, withdraw, borrow, repay, set slippage,
          show something — and reports anything else as not recognised rather than guessing, because
          guessing wrong here means building a transaction the user did not ask for. Three requests
          are refused with a reason: reinvesting one stock's dividend into another (the protocol
          buys back the token that paid), running two modes on one position (mode is per token),
          and “protecting” a portfolio (streams accrue regardless of market hours and nothing is
          leveraged by default).
        </p>
        <Shot
          name="agent"
          n={16}
          alt="The agent console: a conversation showing parsed intents, tool calls, and the agent's reply about two open streams, with example prompts and a command line."
          caption="The agent console. Each command becomes visible tool calls, then a plan card. Nothing executes without Confirm; onchain, nothing executes without a signature."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 14. Using the app                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="using"
        index="14"
        title="Using the app"
        kicker="Every page renders and every interaction works with no wallet, ever. Connecting one swaps the data source; it never gates the UI."
      >
        <p>
          Before a wallet is connected the app shows a <strong>reference portfolio</strong>: live streams
          accruing per second, three weeks of history, a funded vault, an open credit line, a split
          series and a working agent console. Every action mutates one in memory store and every
          page reads from it, so the numbers agree everywhere. Connecting a wallet against a
          deployed chain swaps that store for chain reads through the SDK; components never know
          which one they are on.
        </p>
        <ol>
          <li><strong>Deposit</strong> (<Link href="/app/deposit">/app/deposit</Link>). Pick a token, type an amount, pick a mode, confirm against the receipt. Eligibility is checkpointed the second it lands; the next ex date after that is yours.</li>
          <li><strong>Set or change a mode</strong> from the dashboard's holdings table. The change applies to the next dividend, never to one already streaming.</li>
          <li><strong>Start an advance</strong> when a held stock goes ex. The dashboard surfaces it; one click activates and either pays the wallet or opens the stream.</li>
          <li><strong>Claim</strong> a stream at any second. In Reinvest mode the button reads “Claim + reinvest” and the claim lands as stock.</li>
          <li><strong>Provide liquidity</strong> (<Link href="/app/vault">/app/vault</Link>). Deposit USDG, earn the advance fee; withdraw anything not currently fronting a dividend.</li>
          <li><strong>Borrow</strong> (<Link href="/app/borrow">/app/borrow</Link>). Draw up to 40% of collateral value; watch net carry and the health factor; repay whenever, or let the dividends chip away at it.</li>
          <li><strong>Split</strong> (<Link href="/app/split">/app/split</Link>). Split spare stock into PT and YT, harvest a dividend that has gone ex, claim your share of the pool, merge back at par.</li>
          <li><strong>Read the calendar</strong> (<Link href="/app/calendar">/app/calendar</Link>). One column is the product: the days you are paid early, in cyan.</li>
          <li><strong>Tell the agent</strong> (<Link href="/app/agent">/app/agent</Link>) what to do in a sentence, read the plan, confirm.</li>
        </ol>
        <Pair>
          <Shot
            name="calendar"
            n={17}
            alt="The ex date calendar: tokens, per share amount, ex date, pay date, and a cyan column of days paid early."
            caption="The calendar. Wait for the issuer and you get the right hand date; use Osinko and you get the left hand one, minus one percent."
          />
          <Shot
            name="deposit-summary"
            n={18}
            alt="The deposit order summary: token, deposit amount, value, mode, next ex date and the estimated next dividend, above a confirm button."
            caption="The receipt a deposit is confirmed against. Nothing lands without the mode, the next ex date and the estimated dividend on the same card."
          />
        </Pair>
        <p>
          <strong>Local run.</strong> Three terminals, or one if you background the first two: a chain, a
          deploy and seed, the app. The seed funds the vault with two million USDG and declares
          three dividends — one going ex in a minute, one tomorrow, one next week — so the product
          is alive from the first click.
        </p>
        <Code title="One command local run" lang="bash">{`pnpm install
pnpm chain                      # anvil, chain id 31337, 2s blocks
pnpm contracts:deploy:local     # deploys, declares 3 dividends, funds the vault, syncs ABIs
pnpm dev                        # http://localhost:3000

pnpm contracts:test             # 96 tests: unit, fuzz, integration, invariants
pnpm typecheck                  # sdk + mcp + web`}</Code>
        <p>
          <strong>Your own deployment.</strong> Deploy and seed with Foundry, sync ABIs into the SDK, and
          point the app at the chain with five environment variables — chain id, chain name, RPC,
          explorer name and explorer URL. The address book is written to{" "}
          <code>contracts/deployments/&lt;chainId&gt;.json</code> and regenerated into the SDK; committing
          both makes the next deploy fully interactive with no code changes. The README carries the
          exact commands.
        </p>
        <p>
          Values pasted into a hosting dashboard are sanitised before use — wrapping quotes and
          stray whitespace once turned the chain id into <code>NaN</code> and took the whole app down —
          and a set but broken value falls back to Robinhood Chain, which is the sane recovery for
          a hosted deployment. The vault page right now reports{" "}
          <span className="num text-ink">${fmt(vault.tvlUsd, 0)}</span> locked at{" "}
          <span className="num text-ink">{vault.utilizationPct.toFixed(1)}%</span> utilisation of an{" "}
          <span className="num text-ink">{vault.capPct.toFixed(0)}%</span> cap; that line is live, like every
          other number on this page.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 15. Glossary                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Section id="glossary" index="15" title="Glossary">
        <Terms
          rows={[
            { term: "Basis point (bps)", def: "One hundredth of a percent. 100 bps = 1%. Every fee and cap in the contracts is stored in basis points." },
            { term: "Checkpoint", def: "A (timestamp, value) pair written on every balance change, so any past balance can be read back exactly. OpenZeppelin Checkpoints.Trace208." },
            { term: "Close factor", def: "The maximum share of a borrower's debt a liquidator may repay in one liquidation. 50%." },
            { term: "ERC-4626", def: "The tokenized vault standard. Deposit an asset, receive shares whose price rises with the vault's earnings. The advance vault implements it." },
            { term: "Keeper", def: "An automated, permissioned caller that does housekeeping: settles dividends, runs clawback, batch claims for holders, opens split series. It can never redirect funds." },
            { term: "Obligation", def: "Net USDG the vault still owes to holders who advanced. Always covered by cash." },
            { term: "Orbit L2", def: "An Arbitrum Orbit rollup. Robinhood Chain is one, so anything written for Arbitrum semantics runs on it." },
            { term: "Receivable", def: "Gross USDG the issuer will hand over at settlement for advances already booked. Capped at 80% of vault assets." },
            { term: "Utilisation", def: "receivables ÷ totalAssets. How much of the vault is currently fronting dividends." },
            { term: "Unsigned transaction", def: "{ to, data, value, description } — calldata built for a wallet to review and sign. Everything the agent and SDK produce for a write." },
          ]}
        />
        <p className="border-t border-line-soft pt-6 text-[13px] text-faint">
          Nothing here is financial advice. PT and YT, once a market exists, are volatile, market
          priced tokens and may lose value. Robinhood Chain and stock token names are used to
          describe what the software does.
        </p>
      </Section>
    </DocsShell>
  );
}
