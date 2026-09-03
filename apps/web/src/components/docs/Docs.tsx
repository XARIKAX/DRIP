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
    label: "Start here",
    entries: [
      { id: "overview", index: "1", title: "What Osinko is" },
      { id: "aave-of-stocks", index: "1.1", title: "The Aave of stocks", sub: true },
      { id: "what-it-is-not", index: "1.2", title: "What it is not", sub: true },
    ],
  },
  {
    label: "How it works",
    entries: [
      { id: "custody", index: "2", title: "Putting stock in" },
      { id: "deposit", index: "2.1", title: "Deposit", sub: true },
      { id: "checkpoint", index: "2.2", title: "The ex date rule", sub: true },
      { id: "modes", index: "2.3", title: "Three choices", sub: true },
      { id: "activation", index: "2.4", title: "Starting a payout", sub: true },
      { id: "early", index: "3", title: "Getting paid early" },
      { id: "stream", index: "4", title: "Paid every second" },
      { id: "reinvest", index: "5", title: "Buying more stock" },
      { id: "borrow", index: "6", title: "Borrowing" },
      { id: "split", index: "7", title: "Splitting a stock" },
    ],
  },
  {
    label: "Safety",
    entries: [
      { id: "settlement", index: "8", title: "When the company pays, or doesn't" },
      { id: "roles", index: "9", title: "Who controls what" },
      { id: "risks", index: "10", title: "Risks" },
    ],
  },
  {
    label: "Details",
    entries: [
      { id: "architecture", index: "11", title: "The contracts" },
      { id: "universe", index: "12", title: "The stocks and their prices" },
      { id: "agent", index: "13", title: "The agent and the code kit" },
      { id: "using", index: "14", title: "Using the app" },
      { id: "glossary", index: "15", title: "Words we use" },
    ],
  },
];

const LINKS: QuickLink[] = [
  { label: "Dashboard", href: "/app" },
  { label: "Deposit", href: "/app/deposit" },
  { label: "Borrow", href: "/app/borrow" },
  { label: "Split", href: "/app/split" },
  { label: "The pool", href: "/app/vault" },
  { label: "Payout calendar", href: "/app/calendar" },
  { label: "Agent", href: "/app/agent" },
  { label: "Source code on GitHub", href: REPO, external: true },
  { label: "Notes for developers", href: `${REPO}/blob/HEAD/HANDOFF.md`, external: true },
];

/**
 * The documentation, in full.
 *
 * Written to be read by anyone who owns a stock, not only by people who write
 * contracts: short sentences, everyday words, and a term explained the first time it
 * appears. Every live number on this page comes from the same data source as the app,
 * so a figure quoted here is the figure the dashboard shows.
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
    { label: "Stocks you can use", value: `${universe.length} Robinhood stock tokens` },
    { label: "You get paid in", value: "USDG, a dollar stablecoin" },
    { label: "Runs on", value: "Robinhood Chain" },
    { label: "Prices come from", value: "Chainlink, under 1 hour old" },
    { label: "Who gets a dividend", value: "Anyone deposited before the ex date" },
    { label: "Fee to get paid early", value: "1% · can never pass 5%" },
    { label: "Most of the pool lent out", value: "80% · can never pass 95%" },
    { label: "How often you are paid", value: "Every second" },
    { label: "Most you can borrow", value: "40% of your stock" },
    { label: "Danger line for a loan", value: "65% of your stock" },
    { label: "Fee to split a stock", value: "0.1% · can never pass 1%" },
    { label: "Longest wait for pay day", value: "90 days" },
    { label: "Contracts · tests", value: "10 · 96 passing" },
    {
      label: "Earned while you read",
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
      <div className="serial">Start here</div>
      <h1 className="display relative mt-5 text-[clamp(40px,5.4vw,70px)] leading-[0.98] tracking-[-0.02em]">
        The Aave of stocks,
        <br />
        <span className="italic text-cyan-deep">explained.</span>
      </h1>
      <p className="mt-8 max-w-[62ch] text-[17.5px] leading-[1.65] text-ink">
        Stocks pay dividends. Today the cash shows up weeks after you earned it, then sits
        there doing nothing. Osinko fixes that. Put your stock in and the dividend pays out
        the day you earn it. Split the stock and sell the dividend on its own. Or borrow
        against the stock and let the dividends pay the interest.
      </p>
      <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.7] text-muted">
        This page explains all of it, and every number the code enforces. The sheet on the
        right is the short version. Sections are numbered so you can point someone to one.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <span className="pill">Robinhood Chain</span>
        <span className="pill">You keep your keys</span>
        <span className="pill">Rules live in code</span>
        <span className="pill-live">
          <span className="beacon" aria-hidden />
          {source === "demo" ? "Numbers below are live, from the sample portfolio" : "Numbers below are live, from your wallet"}
        </span>
      </div>
    </header>
  );

  return (
    <DocsShell toc={TOC} glance={glance} links={LINKS} hero={hero}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. What Osinko is                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="overview"
        index="1"
        title="What Osinko is"
        kicker="A dividend is a simple promise. Osinko is the plumbing that promise never had."
      >
        <p>
          <strong>Osinko</strong> is Finnish for <em>dividend</em>. It is a place to put stock that pays
          dividends, so that the dividends work harder. You deposit a stock. Osinko keeps a
          record of who owned what, and when. Each time a dividend is announced, Osinko works
          out your share and sends it where you told it to. Your stock never changes. It is
          not wrapped, swapped, or lent out behind your back.
        </p>
        <p>
          There are six things you can do. <strong>Early</strong>: get the dividend the day you qualify,
          not three weeks later, for a 1% fee. <strong>Stream</strong>: get it a little every second
          instead of one lump. <strong>Reinvest</strong>: have it buy more of the same stock the moment
          it lands. <strong>Borrow</strong>: take a loan against your stock and let the dividends pay the
          interest. <strong>Split</strong>: turn one share into a share token and a dividend token, and
          sell either one. <strong>Agent</strong>: say what you want in plain words and approve the plan.
        </p>

        <Terms
          rows={[
            { term: "Stock token", def: "A token from Robinhood that stands for one share of a real stock. It lives in your crypto wallet like any other token." },
            { term: "Dividend", def: "Cash a company pays to the people who own its stock, usually four times a year." },
            { term: "Ex date", def: "The day you must own a stock to get its next dividend. Own it on that day and the money is yours, even if you sell the day after." },
            { term: "Pay date", def: "The day the company actually sends the money. Usually about three weeks after the ex date." },
            { term: "USDG", def: "A dollar stablecoin. One USDG is worth one dollar. Every payment in Osinko is made in it." },
            { term: "The pool", def: "A pot of USDG put in by lenders. It pays dividends out early and lends against stock, and earns fees and interest for doing it." },
            { term: "Rule", def: "Your choice for what happens to a stock's dividends: cash early, a steady drip, or buying more stock. One rule per stock." },
            { term: "Share token · dividend token", def: "The two halves of a split share. The share token becomes the whole share on an end date. The dividend token collects every dividend until then." },
            { term: "Safety score", def: "For a loan: what your stock is worth × 0.65, divided by what you owe. Above 1.00 you are fine. Below it, some stock gets sold to pay the loan down." },
          ]}
        />

        <Shot
          name="dashboard"
          n={1}
          alt="The Osinko dashboard: portfolio value, earned this week, stocks on deposit and the next ex date, above a META dividend ready to be paid early and two dividends paying out every second."
          caption="The dashboard. Two dividends are paying out a little every second, and a META dividend that qualified yesterday is waiting for you to take it early. Everything works with or without a wallet connected."
        />

        <Sub id="aave-of-stocks" index="1.1" title="The Aave of stocks">
          <p>
            Aave is the biggest lending market in crypto. Anyone can put a token in, anyone
            can borrow against it, and the code decides the interest rate and when a loan is
            in trouble. <strong>Osinko is the Aave of stocks.</strong> Same idea, built for real stocks
            and the dividends they pay. Here is where the two match, and where a stock is
            different from a crypto token.
          </p>
          <Table
            head={["", "Aave", "Osinko"]}
            rows={[
              ["What you put in", "Crypto tokens", "Robinhood stock tokens"],
              ["Where the cash comes from", "The tokens people put in", "A pool of USDG put in by lenders"],
              ["How lenders earn", "Interest from borrowers", "A 1% fee for paying dividends early, plus interest from borrowers"],
              ["Who owes the pool money", "Borrowers", "Companies that owe a dividend on pay day, and borrowers"],
              ["What backs a loan", "The tokens you put in", "The stock you put in, which keeps earning dividends the whole time"],
              ["Who pays the interest", "You", "Your dividends first. You only cover what they don't"],
              ["When a loan is in trouble", "Safety score below 1", "Safety score below 1, at 65% of your stock's value"],
              ["Where prices come from", "Chainlink", "Chainlink, never more than an hour old"],
              ["A hard limit on lending", "Rates go up to slow it", "The pool never lends out more than 80%. Full stop."],
            ]}
          />
          <p>
            The one thing Aave has no version of is <em>time</em>. A dividend is owed for about
            three weeks between the ex date and the pay date. That is a known amount, from a
            known company, due on a known day. Sections 3 to 5 are all about what you can do
            with that gap. Aave lends against a price. Osinko also lends against a calendar.
          </p>
          <Callout label="Two names, one idea">
            You may also see Osinko called <em>the Aave of dividends</em>. Same thing, seen from the
            other side. The stock is what you put in. The dividend is what everything is built
            around. Aave is Finnish for ghost. Osinko is Finnish for dividend.
          </Callout>
        </Sub>

        <Sub id="what-it-is-not" index="1.2" title="What it is not">
          <ul>
            <li>
              <strong>Not a wrapper.</strong> Putting stock in does not give you some other token in
              return. Your stock sits in Osinko as your stock, and you can take it out any
              time. Split (§7) is the one exception, and you have to choose it.
            </li>
            <li>
              <strong>Not something that reads your wallet.</strong> Only stock inside Osinko before the
              ex date counts (§2.2). Osinko never looks at other wallets and never needs
              Robinhood to change anything.
            </li>
            <li>
              <strong>Not a new kind of investment.</strong> No made-up yield, no promise beyond what
              the company already owes. It is the same dividend, sent early, sent steadily,
              turned into more stock, used to pay a loan, or sold on its own.
            </li>
            <li>
              <strong>Not leverage unless you ask for it.</strong> Borrowing is a choice. If you never
              take a loan you owe nothing and nothing can ever be sold.
            </li>
            <li>
              <strong>Not in charge of your keys.</strong> The app builds transactions for your wallet
              to sign. The agent can only plan. Nothing here can move your money without you
              (§13).
            </li>
          </ul>
          <Shot
            name="certificate"
            n={2}
            alt="An engraved Osinko share certificate for one hundred and fifty shares of Apple Inc, with a $39.00 dividend coupon attached along a tear-off line and an ex date stamp."
            caption="The thing Osinko replaces: a paper share certificate with a dividend coupon you tore off along the dotted line. Osinko keeps the certificate whole and does the work on the coupon."
          />
        </Sub>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Putting stock in                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="custody"
        index="2"
        title="Putting stock in"
        kicker="Everything starts with one deposit. Osinko holds the stock, keeps the record, and sends the money."
      >
        <p>
          One contract, called <code>DripCore</code>, is the one you deal with. It holds your stock.
          It writes down every change to your balance with the exact second it happened. When
          a dividend comes, it uses that record to work out your share and sends it the way
          your rule says. Here is the life of one dividend, left to right.
        </p>
        <Figure
          n={3}
          caption="The life of one dividend. Stock deposited before the ex date counts. Between the ex date and pay day, you either get it all at once (Early) or a little every second. On pay day the company pays and the pool is paid back. If the company cancels, the early cash is taken back instead."
        >
          <TimelineFigure />
        </Figure>

        <Sub id="deposit" index="2.1" title="Deposit">
          <p>
            Pick a stock and an amount. Your wallet signs two things: permission for Osinko to
            take the tokens, then the deposit itself. Osinko writes your new balance to the
            record with a timestamp. Your first deposit of a stock also sets its rule to
            Stream, and says so out loud, so the default is on the record too.
          </p>
          <p>
            You can take stock out at any time. Taking it out only affects dividends whose ex
            date has not come yet. If a dividend already had its ex date while your stock was
            in, that dividend is still yours. Osinko reads the record from that day, not your
            balance today.
          </p>
          <Code title="The two transactions a deposit takes" lang="typescript">{`import { buildApprove, buildDeposit, parseStock } from "@drip-markets/sdk";

const amount = parseStock("25");            // 25 AAPL
const approve = buildApprove(AAPL, deployment.dripCore, amount, "AAPL");
const deposit = buildDeposit(deployment, AAPL, amount, "AAPL");
// Each one is { to, data, value, description }. Your wallet signs it. Nothing else can.`}</Code>
          <Params
            rows={[
              { name: "Which tokens work", value: "Normal stock tokens", note: "Tokens that change your balance on their own, or take a cut on every transfer, do not work here. Osinko records what you sent, so those would break the record." },
              { name: "What Osinko stores", value: "Your balance, your rule", note: "One entry per stock per person. The app lists every stock you have ever put in from this." },
              { name: "Pause switch", value: "Held by the admin", note: "In an emergency, deposits, withdrawals and new payouts can be paused. Dividends already paying out keep going." },
            ]}
          />
        </Sub>

        <Sub id="checkpoint" index="2.2" title="The ex date rule">
          <p>
            <strong>Only stock that is inside Osinko before the ex date gets that dividend.</strong> This
            one rule shapes everything else, so it is worth being clear about it.
          </p>
          <p>
            Every deposit, withdrawal and purchase is written down with the exact second it
            happened. So Osinko can always answer one question exactly: how much did this
            person have at that second? That answer, times the dividend per share, is what
            you are owed. Nothing else goes into it.
          </p>
          <Formula note="A deposit that lands in the same second as the ex date counts. A withdrawal one second later changes nothing.">
            what you are owed = your shares on record at the ex date × dividend per share{"\n"}
            what you get early = that, minus the 1% fee
          </Formula>
          <Figure
            n={4}
            caption="A balance that steps up with two deposits and down with a withdrawal. The ex date falls while the balance is 150 shares, so the dividend is 150 × $0.26 = $39.00, or $38.61 if taken early. That is the AAPL payout in Fig. 1. The withdrawal afterwards changes nothing."
          >
            <CheckpointFigure />
          </Figure>
          <p>
            Why do it this way? Because then Osinko works with any normal stock token. It does
            not need Robinhood to change anything, it does not need to look at other wallets,
            and it does not need to trust anyone else's list. The trade-off is that you have
            to deposit first. The app says so everywhere it can.
          </p>
          <Callout label="Not going to change">
            Reading balances from outside wallets instead would mean redoing how dividends,
            pay day and cancellations all work. Everything downstream is built on this record
            and nothing else.
          </Callout>
        </Sub>

        <Sub id="modes" index="2.3" title="Three choices for your dividends">
          <p>
            Each stock gets one rule. Osinko reads the rule when a dividend is started, and
            that dividend keeps it. If you change the rule later, the change applies to the
            next dividend, never to one already paying out.
          </p>
          <Table
            head={["Rule", "What happens", "When you get the cash", "Cost"]}
            rows={[
              ["Cash early", "The whole dividend, minus 1%, goes to your wallet", "On the ex date, all at once", "1% fee"],
              ["Stream", "The dividend pays out a little every second", "From the ex date to pay day, whenever you collect", "1% fee"],
              ["Reinvest", "Same as Stream, but each time you collect it buys more of the stock", "Every second, as stock instead of cash", "1% fee, plus the price you pay for the stock"],
            ]}
          />
          <p>
            You can also do nothing. If you never start a dividend, you can still collect it
            after the company pays, at full value, with no fee at all (§8). The fee is the
            price of getting it early. If you do not want it early, you do not pay it.
          </p>
          <Shot
            name="deposit-modes"
            n={5}
            alt="The three rules on the deposit page: Cash early, Stream and Reinvest, each with a one line description."
            caption="Step three of a deposit. The rule is per stock, not per dividend. It applies to every dividend that stock pays until you change it."
          />
        </Sub>

        <Sub id="activation" index="2.4" title="Starting a payout">
          <p>
            Once a dividend's ex date has passed, someone has to press start. <strong>Anyone can.</strong>{" "}
            You can, the app can, an agent can, or a helper bot can. That is safe, because the
            money can only ever go to the person who owns the stock. There is a batch version
            too, which starts many people at once and skips anyone it cannot.
          </p>
          <ol>
            <li>The dividend must be announced, its ex date must have passed, and pay day must not have arrived yet.</li>
            <li>Osinko reads your shares from the record on the ex date. If it is zero, nothing happens.</li>
            <li>The pool writes down what the company will owe it, and takes its 1% fee (§3). You are now owed the rest.</li>
            <li>Cash early: the pool sends you the whole amount now. Stream or Reinvest: a payout opens that runs from the ex date to pay day (§4).</li>
          </ol>
          <Params
            rows={[
              { name: "When you can start", value: "After the ex date, before pay day", note: "Too early or too late and the transaction is refused. After pay day, the full-value path in §8 takes over." },
              { name: "How many times", value: "Once per person per dividend", note: "Osinko remembers whether each dividend has been started, collected, or cancelled for each person." },
              { name: "What gets recorded", value: "Two events", note: "One when the dividend is worked out, one when it is started. The history on the dashboard is built from these." },
            ]}
          />
        </Sub>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Getting paid early                                               */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="early"
        index="3"
        title="Getting paid early — the pool"
        kicker="A company owes you a known amount on a known day. A pool of cash can pay you today and collect from them later."
      >
        <p>
          When you start a dividend, the pool (a contract called <code>AdvanceVault</code>) is
          fronting money the company will pay weeks later. All of it at once if you chose Cash
          early, or bit by bit as you collect if you chose Stream or Reinvest. The 1% fee is
          the price of that time, and it is what the lenders who fund the pool earn. The whole
          pool boils down to one line of arithmetic:
        </p>
        <Formula note="Cash is USDG sitting in the pool. Owed to the pool is what companies will pay on pay day. Owed by the pool is what it still has to hand to people it paid early.">
          what the pool is worth = cash + owed to the pool − owed by the pool
        </Formula>
        <Figure
          n={6}
          caption="The pool as four bars, with made-up round numbers. When it pays someone early, the amount owed to the pool and the amount owed by the pool both go up, and the pool is worth exactly 1% more, the fee. Everything after that is a wash. Only fees and losses ever move a lender's share price."
        >
          <VaultFigure />
        </Figure>
        <Table
          head={["When", "Cash", "Owed to the pool", "Owed by the pool", "Pool is worth"]}
          rows={[
            ["Someone is paid early", "—", "goes up", "goes up, minus the fee", "up by the fee"],
            ["Cash is sent to them", "goes down", "—", "goes down", "no change"],
            ["The company pays on pay day", "goes up", "goes down", "—", "no change"],
            ["A dividend is cancelled and can't be recovered", "—", "goes down", "—", "down. Lenders take the loss"],
          ]}
        />
        <p>Two rules are checked every single time the pool pays someone early. If either fails, it refuses:</p>
        <ul>
          <li>
            <strong>Cash covers every promise.</strong> The pool must always hold at least as much cash as
            it owes to people it paid early. So collecting a payout can never fail for lack of
            money.
          </li>
          <li>
            <strong>Never more than 80% lent out.</strong> The pool is never fully lent out. Whoever runs
            it can lower this limit but can never set it above 95%.
          </li>
        </ul>
        <Params
          rows={[
            { name: "Fee to get paid early", value: "1% · can never pass 5%", note: "Taken the moment someone is paid early, not when the company pays. The only fee on the dividend side." },
            { name: "Most of the pool lent out", value: "80% · can never pass 95%", note: "Also caps how much a bad dividend announcement could ever cost (§9)." },
            { name: "Longest wait for pay day", value: "90 days", note: "A dividend whose pay day is more than 90 days after its ex date cannot be announced." },
            { name: "First lender protection", value: "Built in", note: "A well known trick against the first depositor cheating later ones is closed off." },
            { name: "Taking money out as a lender", value: "Whatever is not out paying dividends", note: "Cash that is out fronting a dividend is locked until the company pays. Everything else leaves when you ask." },
            { name: "Pause switch", value: "Stops deposits and withdrawals", note: "Including lenders taking money out. That is on purpose for an emergency, and flagged for review." },
          ]}
        />
        <Shot
          name="vault"
          n={7}
          alt="The pool page: money in the pool, yearly return, how much is lent out against an 80 percent limit, and how much has been paid out early."
          caption="The pool page. The lent-out bar shows the 80% limit. The yearly return is the fee income spread over a year. Once Borrowing is live, loan interest is added to it (§6)."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Paid every second                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="stream"
        index="4"
        title="Paid every second"
        kicker="A lump once a quarter is a habit, not a law. A computer can pay by the second just as easily."
      >
        <p>
          The <code>StreamEngine</code> turns your dividend into a steady payout from the ex date to
          pay day. It does not actually send money every second. It just knows the total and
          the two dates, so at any moment it can work out how much has built up. Opening a
          payout costs one write to the chain, and so does each time you collect.
        </p>
        <Formula note="Whole dollars are split into millionths, so tiny amounts still count. The app shows the rate per second so the number on screen can tick.">
          built up so far = total × (time passed ÷ total time){"\n"}
          ready to collect = built up so far − already collected
        </Formula>
        <Figure
          n={8}
          caption="The MSFT payout from Fig. 1: 220 shares × $0.83 × 0.99 = $180.77 over 21 days. The straight line is what has built up. The staircase is what has been collected. The gap between them is what you get if you collect right now. Waiting loses nothing, and collecting often gains nothing."
        >
          <StreamFigure />
        </Figure>
        <ul>
          <li>
            <strong>Collect</strong> whenever you like. Only you can collect your own payout.
          </li>
          <li>
            A helper bot can collect <strong>for</strong> you, but the money still goes to you, or to buying
            your stock. Never to the bot.
          </li>
          <li>
            Each time you collect, the cash comes from the pool. That is why the pool always
            keeps enough cash on hand to cover every open payout (§3).
          </li>
          <li>
            A payout closes when it has all been collected after pay day, or if the dividend is
            cancelled (§8).
          </li>
        </ul>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Buying more stock                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="reinvest"
        index="5"
        title="Buying more stock"
        kicker="Your broker buys more stock the day after pay day, during market hours, and keeps the fraction inside their app. A pool of money does not keep office hours."
      >
        <p>
          With the Reinvest rule, collecting does not stop at your wallet. The cash goes to a
          contract called the <code>Reinvestor</code>, which buys more of the same stock that paid the
          dividend and adds it to your balance in Osinko. Your balance goes up, the record is
          updated, and your next dividend is bigger because you own more. It all happens in
          one transaction.
        </p>
        <ol>
          <li>You, or a helper bot, collect a Reinvest payout. The pool sends the cash to the Reinvestor.</li>
          <li>The Reinvestor checks the live Chainlink price and sets the worst price it will accept, based on your limit.</li>
          <li>It buys the stock. If the price it would get is worse than your limit, the whole thing is cancelled instead of going through badly.</li>
          <li>Osinko adds the new stock to your balance and writes it to the record.</li>
        </ol>
        <Params
          rows={[
            { name: "How much worse a price you will accept", value: "1% by default · at most 10%", note: "You can change this for your own account. Zero is not allowed and neither is anything over 10%." },
            { name: "Where the price check comes from", value: "Chainlink, never the exchange itself", note: "A price the trade itself could push around inside one block is not a safe price to check against." },
            { name: "Where the stock is bought", value: "Uniswap on Robinhood Chain", note: "In development a stand-in is used instead." },
            { name: "Buying a different stock", value: "Not possible, on purpose", note: "AAPL dividends buy AAPL. If you want something else, choose Cash early and buy it yourself. Two steps you can see." },
          ]}
        />
        <Table
          head={["", "Your broker today", "Osinko"]}
          rows={[
            ["Reinvesting", "The day after pay day", "The same moment you collect"],
            ["Hours", "Weekdays, 9:30 to 4", "Every second of every day"],
            ["Part of a share", "Stuck inside one app", "A token you hold yourself"],
            ["When you get the cash", "Pay day, three weeks after you qualify", "The ex date, minus 1%"],
            ["How often", "One lump, four times a year", "A little every second"],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Borrowing                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="borrow"
        index="6"
        title="Borrowing"
        kicker="Once the stock is on chain, it can do what stocks have always done for the wealthy: back a loan. This is where the name comes from."
      >
        <Callout label="Where this stands">
          Borrowing works in the app today, on the same data as every other page. The contract
          that will run it on chain is fully designed but not deployed yet. The numbers below
          are that design. The app is built around them, so nothing changes for you when the
          contract goes live.
        </Callout>
        <p>
          You borrow USDG against stock you already put in. The stock stays in Osinko, keeps
          its rule, and keeps earning dividends. It is just locked so you cannot take it out
          while it backs a loan. The USDG comes from the same pool that pays dividends early, so
          lenders earn loan interest on top of the 1% fee.
        </p>
        <p>
          Here is the part that makes Osinko different. Whenever your stock earns a dividend,
          that money goes to your loan <strong>first</strong>. Interest first, then the loan itself if
          you want, and only then wherever your rule says. Borrow a modest amount and your
          dividends cover the whole interest bill. The loan pays for itself.
        </p>
        <Figure
          n={9}
          caption="How much you can borrow. Up to 40% of what your stock is worth. Between 40% and 65%, you cannot borrow more, but nothing is sold either. Past 65%, someone can pay off up to half your loan and take stock worth that plus a 5% bonus. The marker is this portfolio, live."
        >
          <LtvFigure ltvPct={ltvPct} healthFactor={credit.healthFactor} />
        </Figure>
        <Params
          rows={[
            { name: "Most you can borrow", value: "40% of what your stock is worth", note: "Kept well below the danger line on purpose. The gap is what lets a loan ride out a bad month." },
            { name: "Danger line", value: "65%", note: "Safety score = your stock's value × 0.65 ÷ what you owe. Below 1.00, some stock can be sold to pay the loan down." },
            { name: "How much can be sold at once", value: "Up to half the loan, plus a 5% bonus", note: "Whoever pays down your loan gets stock worth that amount plus 5%. It is sold at a price checked against Chainlink." },
            { name: "Interest rate", value: "2% when the pool is quiet, 8% when 80% is lent out", note: "The busier the pool, the higher the rate, the same way Aave does it. It is 5.8% today." },
            { name: "Where dividends go first", value: "Interest → loan → your rule", note: "If the price feed is stale, no new loans are given and nothing is sold. Stock is never sold on an old price." },
          ]}
        />
        <p>Here is the portfolio in the app, right now, in those terms:</p>
        <Params
          rows={[
            { name: "Your stock is worth", value: `$${fmt(credit.collateralValueUsd, 0)}` },
            { name: "You borrowed", value: `$${fmt(credit.borrowedUsd, 0)} of a possible $${fmt(credit.maxBorrowUsd, 0)}` },
            { name: "Borrowed as a share of your stock · safety score", value: `${ltvPct.toFixed(1)}% · ${Number.isFinite(credit.healthFactor) ? credit.healthFactor.toFixed(2) : "∞"}` },
            { name: "Dividends your stock earns", value: `+$${fmt(credit.dividendsPerYearUsd)} a year` },
            { name: "Interest the loan costs", value: `−$${fmt(credit.interestPerYearUsd)} a year at ${credit.borrowAprPct.toFixed(1)}%` },
            {
              name: "You come out",
              value: `${credit.netCarryPerYearUsd >= 0 ? "ahead" : "behind"} by $${fmt(Math.abs(credit.netCarryPerYearUsd))} a year`,
              note: credit.netCarryPerYearUsd >= 0 ? "The dividends earn more than the interest costs. The loan pays for itself." : "The interest costs more than the dividends earn. The difference is added to the loan.",
            },
          ]}
        />
        <Shot
          name="borrow"
          n={10}
          alt="The borrow page: what your stock is worth, what you borrowed, a safety score with a meter to the 65 percent danger line, how much you come out ahead each year, and a live counter of interest your dividends have paid."
          caption="The borrow page. It leads with the one number that matters: do your dividends earn more than the loan costs? The counter of interest already paid by dividends ticks every second."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 7. Splitting a stock                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="split"
        index="7"
        title="Splitting a stock"
        kicker="Everything else leaves your share whole. Split is the one thing that does not, and you have to choose it."
      >
        <p>
          The <code>SplitVault</code> turns one share into two tokens. The <strong>share token</strong> is the
          stock without its dividends. On the end date, you hand it back and get the whole
          share. The <strong>dividend token</strong> is the dividends without the stock. It collects every
          dividend the stock pays until the end date, and nothing else. Sell one and keep the
          other, or sell both. Hold one of each and you can always put them back together into
          the whole share, for free, any time.
        </p>
        <Figure
          n={11}
          caption="One share goes in. Out come 0.999 share tokens and 0.999 dividend tokens, after the 0.1% fee. The share token turns back into stock on the end date. The dividend token collects each dividend, shared out by who held it on that dividend's ex date. One of each rejoins into the whole share for free, before or after the end date."
        >
          <SplitFigure />
        </Figure>
        <p>
          Under the hood it is simple. The SplitVault puts the stock into Osinko under its own
          name, set to Cash early, exactly like any other person would. When a dividend comes,
          the vault takes it early like anyone else, pays the same 1% fee, and follows the same
          two pool rules. The cash lands in a pot that only dividend token holders can draw
          from.
        </p>
        <Table
          head={["Action", "Who", "What happens"]}
          rows={[
            ["Open a split for a stock", "A helper with permission", "Sets a stock and an end date and creates its two tokens. Only one split per stock can be open at a time."],
            ["Split", "Anyone", "Put stock in, get one share token and one dividend token per share, minus the 0.1% fee. Not allowed after the end date."],
            ["Rejoin", "Anyone", "Hand back one of each, get the whole share. Free. Works before or after the end date."],
            ["Cash in", "Anyone, after the end date", "Hand back share tokens alone, get the stock."],
            ["Collect a dividend", "Anyone", "Once a dividend's ex date has passed, pull it into the pot. Osinko notes who held dividend tokens that day."],
            ["Take your share", "Dividend token holders", "Your part of the pot, based on how many dividend tokens you held on that ex date. Once per dividend."],
            ["Change the fee", "The admin", "Between 0% and 1%. Never higher."],
          ]}
        />
        <Callout label="One at a time, on purpose">
          Only one split can be open per stock. A new one cannot start until every share token
          from the old one has been handed back. That keeps one simple fact true at all times:
          the stock the vault holds equals the share tokens out there. It is what makes the
          accounting easy to check. Running several end dates for one stock at once, the way
          some crypto projects do, would need more machinery, and it is the first thing on the
          list for a future version.
        </Callout>
        <ul>
          <li>
            <strong>The right person gets paid.</strong> The dividend token writes down who held it and
            when, the same way Osinko records deposits. So a dividend collected after you sold
            your tokens still pays you, if you held them on the ex date.
          </li>
          <li>
            <strong>The fee stays out of the count.</strong> The 0.1% of stock taken as a fee is kept
            aside, not put into Osinko, so it never muddies the one-to-one match above.
          </li>
          <li>
            <strong>Dividend tokens run out on the end date, not before.</strong> You cannot split after the
            end date, because the dividend token would have nothing left to collect. You can
            always rejoin, because that is harmless.
          </li>
          <li>
            <strong>There is no market for the tokens yet.</strong> The “dividend yield” the app shows is
            just the stock's normal yearly dividend divided by its price. It is not a market
            price. A place to trade share tokens and dividend tokens is the next big thing to
            build.
          </li>
        </ul>
        <Shot
          name="split"
          n={12}
          alt="The split page: share tokens held, dividend tokens held, a countdown to the end date, the dividend yield, a MU dividend ready to collect, and a panel to split, rejoin or cash in."
          caption="A split on MU, ninety days from its end date, with a dividend that qualified four days ago waiting to be collected. Anyone can press collect. The money goes to whoever held dividend tokens that day."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 8. When the company pays, or doesn't                                */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="settlement"
        index="8"
        title="When the company pays, or doesn't"
        kicker="The pool is only as good as the company's payment. Here is what happens when it arrives, and when it does not."
      >
        <Figure
          n={13}
          caption="The three states of a dividend. A trusted news feed announces it. Then either the company pays and the pool is made whole, or the company cancels and the early cash is taken back from each person who took it."
        >
          <LifecycleFigure />
        </Figure>
        <p>
          <strong>The company pays.</strong> On pay day, the money comes into Osinko in one transfer. The
          amount is worked out from the record on the ex date, so it covers everyone who
          qualified, whether or not they pressed start:
        </p>
        <Formula note="This is the only place real dividend cash enters Osinko. On Robinhood Chain, the company's side of this is Robinhood itself.">
          total owed = all shares in Osinko on the ex date × dividend per share
        </Formula>
        <p>
          The pool is paid back first for whatever it fronted. The rest is held for people who
          never pressed start. They can collect it at full value, with no fee, whenever they
          like. The dividend is then marked as paid.
        </p>
        <p>
          <strong>The company cancels.</strong> It is rare, but it happens. The news feed marks the
          dividend cancelled, and a helper bot goes through everyone who took it early:
        </p>
        <ol>
          <li>Any part of the payout not yet collected is simply never paid. That part costs nobody anything.</li>
          <li>Stock worth the cash that was already paid out is taken from that person's deposit and handed to the pool, priced off Chainlink.</li>
          <li>If that does not cover it, the pool takes the loss. Lenders' shares are worth a little less. That risk is what the 1% fee pays them for.</li>
        </ol>
        <Callout label="Still being hardened">
          Before real money: price the stock taken back off the Chainlink feed rather than the
          exchange; decide what to do about someone who took a dividend early and then withdrew
          all their stock before the cancellation landed; and test the case where a cancellation
          lands in the middle of someone collecting. The order of steps is already safe.
        </Callout>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 9. Who controls what                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="roles"
        index="9"
        title="Who controls what"
        kicker="Only the contracts move money. People can add information, pay money in, or send money to its owner. Nothing else."
      >
        <Table
          head={["Who", "What they can do", "Today", "When live for real"]}
          rows={[
            ["Admin", "Pause, set fees and limits within their caps, point at a new exchange", "The deploy key", "A group wallet with a time delay on every change"],
            ["Dividend news feed", "Announce a dividend, or cancel one", "The deploy key", "A service reading official company announcements"],
            ["Pay day helper", "Bring in the company's payment, run cancellations", "The deploy key", "An automated service"],
            ["Collect helper", "Collect payouts on people's behalf", "The deploy key", "An automated service. It can only send money to its owner"],
            ["Split helper", "Open a split for a stock, pause splitting", "The deploy key", "An automated service"],
            ["The contracts themselves", "Move money between each other", "The contracts", "Unchanged. No person ever holds this power"],
          ]}
        />
        <p>
          No role can send your money to someone else. Not the admin, not a helper, not a bug
          in the agent. Here are the things you do have to trust, biggest first:
        </p>
        <ol>
          <li>
            <strong>The dividend news feed.</strong> If it lied, it could announce a dividend that will
            never be paid and drain early payments from the pool, or cancel a real one and
            trigger take-backs. This is the biggest risk. Before launch: several people must
            agree before it speaks, there is already a delay between announcing and the ex
            date, and the pool can never lend out more than 80%, which caps the worst case.
          </li>
          <li>
            <strong>The company paying.</strong> Early payments assume the company pays on pay day. On
            Robinhood Chain that is Robinhood. If it does not, the take-back path exists.
          </li>
          <li>
            <strong>The admin keys.</strong> They can pause, and move fees and limits within hard caps
            (fee at most 5%, lending at most 95%, split fee at most 1%). All of it should sit
            behind a time delay so people can see a change coming.
          </li>
          <li>
            <strong>The price feed.</strong> Prices come from Chainlink, never from the exchange the
            trade is about to use. If the feed is old, trading in that stock stops.
          </li>
        </ol>
        <Callout label="Can the code be changed?">
          Version one cannot. There are no upgrade switches. If something has to change, a new
          version is deployed, the old one is paused, and people move their stock over. Your
          stock is a plain balance, so moving is one deposit. Boring on purpose.
        </Callout>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 10. Risks                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Section id="risks" index="10" title="Risks" kicker="Said plainly. A product that hides how it can go wrong has not thought about it.">
        <ul>
          <li>
            <strong>The news feed could be wrong.</strong> It is the source of truth for what is owed. A
            wrong or dishonest announcement is the biggest single risk (§9).
          </li>
          <li>
            <strong>The company might not pay.</strong> Paying early is a bet that the company pays on pay
            day. If it does not, stock is taken back from people who were paid early, and
            lenders cover the rest.
          </li>
          <li>
            <strong>Lenders' cash can be locked.</strong> Money that is out paying a dividend early is
            stuck until the company pays. A pause stops lenders taking money out.
          </li>
          <li>
            <strong>A loan can be closed out.</strong> If your stock falls in price until your loan is
            past 65% of its value, some stock is sold to pay it down. The 40% borrowing limit
            is the cushion.
          </li>
          <li>
            <strong>Split tokens can lose value.</strong> Once there is a market for them, share tokens
            and dividend tokens will move in price. A dividend token is worth only the dividends
            still to come, and is worth nothing after the end date.
          </li>
          <li>
            <strong>The code could have a bug.</strong> There are 96 tests, including tests that hammer
            the system at random, and a review checklist. There has been no outside audit yet.
          </li>
          <li>
            <strong>The chain and the tokens are new.</strong> Robinhood Chain went public in February
            2026. The stock tokens are issued by Robinhood. The listing rules require a real
            test of each token before real money touches it.
          </li>
        </ul>
        <p>Three things are checked by the tests to be true at all times, no matter what:</p>
        <Formula note="Plus a test that fails loudly if the random testing ever stops reaching the deep cases. A green test suite that tests nothing is the thing to fear.">
          1. The pool always holds enough cash to cover every promise, and never lends past the limit{"\n"}
          2. No payout ever pays more than its total, and totals match what was owed{"\n"}
          3. The stock Osinko holds always equals the sum of everyone's balances
        </Formula>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 11. The contracts                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="architecture"
        index="11"
        title="The contracts"
        kicker="Ten pieces of code, one pool of money. The app and the agent only ever read from these."
      >
        <Figure
          n={14}
          caption="Where the money goes. A news feed announces dividends. You deposit stock. Osinko asks the pool to pay early, or opens a payout. Payouts go to your wallet, or buy more stock that goes back into your balance. The split vault deposits stock like anyone else. The lending contract is designed but not live yet."
        >
          <ArchitectureFigure />
        </Figure>
        <Table
          head={["Contract", "Plain job", "Notes"]}
          rows={[
            ["DividendRegistry", "The list of announced dividends", "The news feed announces and cancels. Pay day can be at most 90 days after the ex date."],
            ["DripCore", "Holds your stock, keeps the record, works out who is owed what", "The one contract you deal with. Can be paused. Guarded against re-entry tricks."],
            ["AdvanceVault", "The pool. Pays dividends early and earns the fee", "Always keeps enough cash for every promise. Never lends past 80%."],
            ["StreamEngine", "Pays dividends out a little every second", "One write to open, one per collect. Helpers can only send money to its owner."],
            ["Reinvestor", "Buys more stock with a dividend", "Checks the price against Chainlink first. Only ever buys the stock that paid."],
            ["SplitVault", "Splits a share into a share token and a dividend token", "Deposits stock like any other person. One open split per stock."],
            ["PrincipalToken · YieldToken", "The share token and the dividend token", "Only the vault can create or destroy them. The dividend token remembers who held it each day."],
            ["ChainlinkPriceOracle", "Reads live prices", "Refuses prices more than an hour old, or that read zero."],
            ["UniswapV3SwapAdapter", "Does the actual buying on Uniswap", "The worst price it accepts is set from Chainlink, not from Uniswap."],
            ["Test stand-ins", "Fake stock, fake USDG, fake exchange, fake prices", "For development only. Not part of the real deployment."],
          ]}
        />
        <p>
          Everything the app shows comes from events the contracts announce. The list below is
          fixed. New events can be added, but these never change shape, so the app keeps
          working when the contracts are updated.
        </p>
        <Code title="Events the app listens for" lang="solidity">{`DividendRegistry  DividendDeclared · DividendSettled · DividendVoided · SupportedTokenAdded
DripCore          Deposited · Withdrawn · ModeSet · EntitlementCreated · EntitlementActivated
                  SettledDividendFunded · SettledEntitlementClaimed · Reinvested · ClawedBack
AdvanceVault      AdvancePaid · AdvanceReleased · AdvanceRepaid · FeeAccrued · LossRecorded
                  CollateralClawedBack
StreamEngine      StreamStarted · StreamClaimed · StreamClosed
Reinvestor        Reinvested · SlippageSet · SwapAdapterSet
SplitVault        SeriesCreated · Split · Merged · PrincipalRedeemed · DividendHarvested
                  YieldClaimed · SplitFeeSet`}</Code>
        <Code title="Where things live in the code" lang="text">{`contracts/src/            the ten contracts, plus test stand-ins
contracts/test/           tests, one file per contract, plus random "invariant" tests
contracts/script/         deploy, seed with sample dividends, verify the stock list
contracts/listings/       4663.json — the list of stocks and their price feeds
packages/sdk/             a TypeScript kit to read the contracts and build transactions
packages/mcp/             the agent server: 4 read commands, 3 write commands, no keys
apps/web/                 this website and app
HANDOFF.md                notes for the developer taking this live`}</Code>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 12. The stocks                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="universe"
        index="12"
        title="The stocks and their prices"
        kicker="If a stock has no live price feed, it is not listed. Nobody types a price in by hand."
      >
        <p>
          The list of stocks lives in one file, <code>contracts/listings/4663.json</code>. A script checks
          every entry against the chain before it is used. Sixteen Robinhood stock tokens are
          on the list. Fifteen are switched on. The sixteenth, SPCX, is switched off because it
          has never traded and its price feed is for a private company. You will never see it
          in the app.
        </p>
        <ol>
          <li><strong>No price feed, no listing.</strong> A stock without a live Chainlink price on this chain is never added, no matter how popular it is.</li>
          <li><strong>Check before adding.</strong> The token's name and decimals, and the feed's name and freshness, are all checked on chain. Any mismatch stops the process.</li>
          <li><strong>Test the trading route.</strong> Every route to buy a stock is quoted before it is switched on.</li>
          <li><strong>Check the final price, not a step in the middle.</strong> A buy goes through two hops. The worst acceptable price is set on the stock at the end, against Chainlink.</li>
          <li><strong>Old prices stop trades.</strong> If a price is more than an hour old, or reads zero, trading in that stock pauses. The system never guesses.</li>
          <li><strong>Test the token itself.</strong> Before real money, each token is sent, held and moved by a contract once, to make sure it behaves.</li>
        </ol>
        <Table
          head={["Stock", "Company", "Price", "Yield", "Next ex date", "Trading route"]}
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
              <span key="l" className="font-mono text-nano uppercase text-faint">{t.liquidity === "live" ? "proven" : "quote first"}</span>,
            ];
          })}
        />
        <p>
          <em>Proven</em> means real purchases have gone through this route. <em>Quote first</em> means
          the route looks right but no purchase has been made yet, so the price is checked
          again before every buy. The prices and yields above come from the same place the app
          is reading right now.
        </p>
        <Shot
          name="universe"
          n={15}
          alt="The stock table on the landing page: fifteen stocks with price, dividend, yield, next ex date and status, above the three listing rules."
          caption="The stock table on the landing page. You can sort and filter it. A table of every stock, priced live, is the proof that the data is real."
        />
        <Table
          head={["Network", "Chain id", "Address", "What it is for"]}
          rows={[
            ["Robinhood Chain", "4663", "https://rpc.mainnet.chain.robinhood.com", "The real thing. The stock list and price feeds are set up for it."],
            ["Anvil", "31337", "http://127.0.0.1:8545", "A chain on your own computer, for development."],
          ]}
          mono={[1, 2]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 13. The agent                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="agent"
        index="13"
        title="The agent and the code kit"
        kicker="Say it in plain words. The agent can plan anything and sign nothing."
      >
        <p>
          Osinko comes with a small server that AI agents can talk to (it uses a standard called
          MCP). The agent can ask questions and get answers straight from the chain. When it
          wants to <em>do</em> something, it does not do it. It hands you a ready-made transaction
          for your wallet to look at and sign. The server has no keys, takes no keys, and has no
          code that could send anything on its own. The agent box in the app works the same
          way, with a plan card you approve before anything moves.
        </p>
        <Table
          head={["Command", "Kind", "What you get back"]}
          rows={[
            ["get_positions", "read", "The stocks someone has in Osinko: how many, what they are worth, and their rule."],
            ["get_streams", "read", "Every payout for someone: ready to collect, total, already collected, dates, and whether it is still open."],
            ["get_calendar", "read", "Every announced dividend: per share, ex date, pay date, status, and how many days early Osinko pays."],
            ["get_vault", "read", "The pool: how much is in it, how much is lent out, how much has been paid early, fees so far."],
            ["set_mode", "write", "A ready-to-sign transaction that changes a stock's rule. Nothing is sent."],
            ["claim_stream", "write", "A ready-to-sign transaction that collects a payout. Only its owner can sign it."],
            ["deposit", "write", "Two ready-to-sign transactions: permission, then the deposit."],
          ]}
          mono={[0, 1]}
        />
        <Code title="Every write comes back in one shape" lang="json">{`{
  "action": "sign_and_send",
  "summary": "Deposit 25 AAPL into Osinko",
  "note": "These transactions are unsigned. Show them to the user to review and sign. This server cannot send them.",
  "transactions": [
    { "to": "0xAAPL…", "data": "0x095ea7b3…", "value": "0x0", "description": "Let Osinko take AAPL" },
    { "to": "0xDripCore…", "data": "0x47e7ef24…", "value": "0x0", "description": "Deposit AAPL into Osinko" }
  ]
}`}</Code>
        <Pair>
          <Code title="Point an agent at it" lang="json">{`{
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
          <Code title="Read the chain from your own code" lang="typescript">{`import { createPublicClient, http } from "viem";
import { DripReader } from "@drip-markets/sdk";

const client = createPublicClient({ transport: http(RPC) });
const reader = DripReader.forChain(client, 4663);

const positions = await reader.getPositions(holder);
const streams   = await reader.getStreams(holder);
const calendar  = await reader.getCalendar();
const vault     = await reader.getVaultStats();
// No server in the middle. If the chain says it,
// the app shows it.`}</Code>
        </Pair>
        <p>
          The agent understands a fixed set of phrasings on purpose: change a rule, collect,
          get paid early, deposit, take out, borrow, repay, set a price limit, or show
          something. Anything else it says it did not understand, rather than guess. Guessing
          wrong would mean building a transaction you did not ask for. Three requests get a
          polite no with a reason: using one stock's dividend to buy a different stock (it
          always buys the stock that paid), giving one stock two rules at once, and “protecting”
          a portfolio (dividends add up whether markets are open or not, and nothing is
          borrowed unless you chose to).
        </p>
        <Shot
          name="agent"
          n={16}
          alt="The agent box: a conversation showing what the agent understood, the commands it ran, and its reply about two payouts, with example prompts and a text field."
          caption="The agent. Each command shows what was understood, then a plan card. Nothing happens until you click confirm, and on chain, until you sign."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 14. Using the app                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="using"
        index="14"
        title="Using the app"
        kicker="Every page works with no wallet at all. Connecting one just swaps in your own numbers."
      >
        <p>
          Before you connect a wallet, the app shows a <strong>sample portfolio</strong>: dividends paying
          out every second, three weeks of history, a funded pool, an open loan, a split stock
          and a working agent. Everything you do updates one shared set of numbers, so every
          page agrees. Connect a wallet and the app reads your real balances from the chain
          instead. The pages do not know the difference.
        </p>
        <ol>
          <li><strong>Deposit</strong> (<Link href="/app/deposit">/app/deposit</Link>). Pick a stock, type how many shares, pick a rule, check the summary, confirm. From that second on, the next ex date counts for you.</li>
          <li><strong>Change a rule</strong> from the dashboard. It applies to the next dividend, not one already paying out.</li>
          <li><strong>Get paid early</strong> when a stock you hold passes its ex date. The dashboard shows it. One click and the cash arrives, or the payout starts.</li>
          <li><strong>Collect</strong> a payout any time. With the Reinvest rule the button says “Collect and buy more”, and you get stock instead of cash.</li>
          <li><strong>Lend</strong> (<Link href="/app/vault">/app/vault</Link>). Put USDG in the pool and earn the 1% fee. Take out anything not currently out paying a dividend.</li>
          <li><strong>Borrow</strong> (<Link href="/app/borrow">/app/borrow</Link>). Borrow up to 40% of what your stock is worth. Watch whether your dividends cover the interest. Repay whenever, or let the dividends do it.</li>
          <li><strong>Split</strong> (<Link href="/app/split">/app/split</Link>). Split spare stock into share tokens and dividend tokens, collect a dividend that has passed its ex date, take your share, or rejoin them.</li>
          <li><strong>See what is coming</strong> (<Link href="/app/calendar">/app/calendar</Link>). One column is the whole point: how many days early you get paid.</li>
          <li><strong>Ask the agent</strong> (<Link href="/app/agent">/app/agent</Link>) in a sentence. Read the plan. Confirm.</li>
        </ol>
        <Pair>
          <Shot
            name="calendar"
            n={17}
            alt="The payout calendar: stocks, dividend per share, ex date, pay date, and a cyan column of days paid early."
            caption="The payout calendar. Wait for the company and you are paid on the right-hand date. Use Osinko and you are paid on the left-hand one, minus 1%."
          />
          <Shot
            name="deposit-summary"
            n={18}
            alt="The deposit summary: stock, shares, value, rule, next ex date and the size of the next payout, above a confirm button."
            caption="The summary you confirm before a deposit. The rule, the next ex date and the size of the next payout are all on one card."
          />
        </Pair>
        <p>
          <strong>Running it yourself.</strong> Three terminals, or one if you background the first two: a
          chain, a deploy, and the app. The deploy script funds the pool with two million USDG
          and announces three dividends, so there is something to look at from the first click.
        </p>
        <Code title="Run it on your own computer" lang="bash">{`pnpm install
pnpm chain                      # a local chain
pnpm contracts:deploy:local     # deploy, announce 3 dividends, fund the pool
pnpm dev                        # http://localhost:3000

pnpm contracts:test             # 96 tests
pnpm typecheck                  # sdk + mcp + web`}</Code>
        <p>
          <strong>Your own deployment.</strong> Deploy with Foundry, sync the contract details into the
          kit, and point the app at your chain with five settings: chain id, chain name, RPC
          address, and the name and address of a block explorer. The README has the exact
          commands.
        </p>
        <p>
          Settings pasted into a hosting dashboard are cleaned up before use. Stray quotes once
          turned the chain id into gibberish and took the whole app down. A broken value now
          falls back to Robinhood Chain. And as one last live check, the pool page right now
          reports <span className="num text-ink">${fmt(vault.tvlUsd, 0)}</span> in the pool with{" "}
          <span className="num text-ink">{vault.utilizationPct.toFixed(1)}%</span> lent out, against a limit of{" "}
          <span className="num text-ink">{vault.capPct.toFixed(0)}%</span>. That sentence is live, like every
          other number on this page.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 15. Words                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Section id="glossary" index="15" title="Words we use">
        <Terms
          rows={[
            { term: "Basis point", def: "One hundredth of one percent. 100 basis points is 1%. The code stores every fee and limit this way." },
            { term: "Chainlink", def: "A service that publishes live prices on chain. Osinko reads stock prices from it and refuses any price more than an hour old." },
            { term: "Helper bot", def: "An automated program with limited permission to do housekeeping: bring in the company's payment, run cancellations, collect payouts for people, open splits. It can never send money to anyone but its owner." },
            { term: "Lender", def: "Someone who puts USDG into the pool. They earn the 1% early payment fee and, once borrowing is live, loan interest." },
            { term: "Pool share", def: "What a lender holds. Its value goes up as the pool earns fees and down if the pool takes a loss." },
            { term: "Robinhood Chain", def: "The blockchain this runs on. It is built on Arbitrum technology and went public in February 2026." },
            { term: "Safety score", def: "For a loan: your stock's value × 0.65 ÷ what you owe. Above 1.00 is fine. Below 1.00, some stock can be sold to pay the loan down." },
            { term: "Stablecoin", def: "A token that is always worth one dollar. USDG is the one Osinko uses." },
            { term: "Unsigned transaction", def: "A transaction that has been written out but not approved. Your wallet approves it, or nothing happens. It is the only thing the agent can produce." },
            { term: "Wallet", def: "The app or device that holds your keys. It is the only thing that can move your money." },
          ]}
        />
        <p className="border-t border-line-soft pt-6 text-[13px] text-faint">
          None of this is financial advice. Share tokens and dividend tokens will move in price
          once there is a market for them, and can lose value. Robinhood Chain and stock names
          are used here to describe what the software does.
        </p>
      </Section>
    </DocsShell>
  );
}
