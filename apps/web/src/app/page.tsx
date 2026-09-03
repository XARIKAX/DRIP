import Link from "next/link";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { TickerStrip } from "@/components/TickerStrip";
import { Footer } from "@/components/Footer";
import { HeroCounter } from "@/components/HeroCounter";
import { DashboardPreview } from "@/components/DashboardPreview";
import { Card, Eyebrow } from "@/components/ui";

const MODULES = [
  {
    index: "01",
    name: "Early",
    line: "Paid at the ex date, not the pay date.",
    body: "A USDG vault fronts your dividend the moment the shares go ex. Three weeks of waiting becomes zero. The vault takes one percent and keeps it as yield for the people who funded it.",
    stat: "21 days early",
  },
  {
    index: "02",
    name: "Stream",
    line: "Per second, not per quarter.",
    body: "Your entitlement becomes a flow. It accrues every second from the ex date to the pay date and you pull it whenever you want. No lump. No calendar. No cutoff.",
    stat: "1 second resolution",
  },
  {
    index: "03",
    name: "Reinvest",
    line: "Reinvested the moment it lands.",
    body: "Every claim swaps straight into more of the same stock token and returns to your position. The cash never touches your wallet. The next dividend is calculated on a bigger balance.",
    stat: "Same block",
  },
  {
    index: "04",
    name: "Borrow",
    line: "Your dividends pay the interest.",
    body: "Draw USDG against your holdings without selling a share. Every dividend your collateral earns is applied to the interest first. At a conservative loan, the yield covers the whole rate.",
    stat: "40% max LTV",
  },
  {
    index: "05",
    name: "Agent",
    line: "Your strategy, in a sentence.",
    body: "Every action is exposed over MCP. Tell an agent to compound, claim, or borrow and it builds the plan. You confirm it. Nothing executes without you.",
    stat: "MCP native",
  },
];

const STATS = [
  { label: "Days early you get paid", value: "21" },
  { label: "Stream resolution", value: "1s" },
  { label: "Borrow APR", value: "5.8%" },
  { label: "Max borrow LTV", value: "40%" },
];

const COMPARISON = [
  { term: "Reinvestment timing", them: "Trading day after pay date", us: "Same transaction as the claim" },
  { term: "Hours", them: "Market hours, midnight cutoff", us: "Every second of every day" },
  { term: "Fractional shares", them: "Locked inside the app", us: "Self custodied ERC-20" },
  { term: "Cash timing", them: "Pay date, weeks after ex", us: "Ex date, minus one percent" },
  { term: "Cadence", them: "Quarterly lump", us: "Continuous stream" },
  { term: "Borrowing", them: "Margin account, interest drag", us: "Dividends service the interest" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper">
      <UtilityBar />
      <SiteNav />
      <TickerStrip />

      {/* Hero */}
      <section className="rule-b relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(1100px 460px at 78% -10%, rgba(53,194,219,0.20), rgba(255,255,255,0) 62%)",
          }}
          aria-hidden
        />
        <div className="shell relative py-20 md:py-28">
          <Eyebrow className="text-cyan-dark">The Aave of dividends · Robinhood Chain</Eyebrow>
          <h1 className="mt-6 text-hero font-extrabold">
            Get paid.
            <br />
            Don&apos;t sell.
          </h1>

          <div className="mt-12 grid gap-12 md:grid-cols-12 md:gap-8">
            <div className="md:col-span-6 lg:col-span-5">
              <p className="max-w-xl text-[17px] leading-relaxed text-ink/80">
                Osinko puts both sides of your portfolio to work. The income side: dividends
                stream per second and arrive weeks early, at the ex date. The credit side: your
                holdings back a USDG line whose interest the dividends pay. Deposit once. Never
                sell a share.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/app" className="btn-primary">
                  Open the app
                </Link>
                <Link href="/app/calendar" className="btn-ghost">
                  See the calendar
                </Link>
              </div>
              <div className="mt-10 flex flex-wrap gap-3">
                <span className="tag">Self custody</span>
                <span className="tag">No app lock in</span>
                <span className="tag-accent">Testnet live</span>
              </div>
            </div>

            <div className="md:col-span-6 lg:col-span-5 lg:col-start-8">
              <Card className="h-full">
                <Eyebrow className="text-muted">Streaming now, protocol wide</Eyebrow>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="num text-2xl font-semibold text-muted">$</span>
                  <span className="text-[clamp(2rem,4vw,3rem)] font-extrabold tracking-tightest text-ink">
                    <HeroCounter />
                  </span>
                </div>
                <div className="mt-1 text-[13px] text-muted">USDG paid to holders this quarter</div>

                <div className="rule-t mt-7 grid grid-cols-2 gap-y-6 pt-7">
                  {STATS.map((s) => (
                    <div key={s.label}>
                      <div className="num text-2xl font-semibold tracking-tighter">{s.value}</div>
                      <div className="mt-1 text-micro font-bold uppercase text-muted">{s.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="shell py-24 md:py-36">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow className="text-cyan-dark">Five modules</Eyebrow>
            <h2 className="mt-3 text-display font-extrabold">One deposit, both sides</h2>
          </div>
          <p className="max-w-sm text-[14px] text-muted">
            Income on one side, credit on the other, feeding each other. A quarterly cheque
            becomes a continuous, compounding, borrowable position.
          </p>
        </div>

        <div className="mt-10 grid gap-px border border-ink bg-ink md:grid-cols-2">
          {MODULES.map((m, i) => (
            <div key={m.index} className={`bg-paper p-8 md:p-10 ${i === MODULES.length - 1 && MODULES.length % 2 === 1 ? "md:col-span-2" : ""}`}>
              <div className="flex items-baseline justify-between">
                <span className="num text-micro font-bold text-cyan-dark">{m.index}</span>
                <span className="num text-micro font-bold uppercase text-muted">{m.stat}</span>
              </div>
              <h3 className="mt-6 text-3xl font-extrabold tracking-tighter">{m.name}</h3>
              <p className="mt-2 text-[15px] font-bold">{m.line}</p>
              <p className="mt-4 text-[14px] leading-relaxed text-muted">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The product, running */}
      <section className="rule-t bg-wash">
        <div className="shell py-24 md:py-36">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Eyebrow className="text-cyan-dark">The product, running</Eyebrow>
              <h2 className="mt-4 text-display font-extrabold">This is live</h2>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">
                Not a screenshot. The panel on the right is the actual dashboard, running on the
                demo portfolio, accruing per second while you read this. Open the app and pick up
                exactly where it leaves off.
              </p>
              <Link href="/app" className="btn-primary mt-7">
                Open the dashboard
              </Link>
            </div>
            <div className="lg:col-span-8">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Black stats band */}
      <section className="bg-ink text-paper">
        <div className="shell grid gap-10 py-14 md:grid-cols-4 md:py-16">
          <div className="md:col-span-1">
            <Eyebrow className="text-cyan">The numbers</Eyebrow>
            <p className="mt-3 text-[14px] text-paper/70">
              Every figure below is enforced by a contract, not a policy.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 md:col-span-3 md:grid-cols-4">
            {[
              { v: "80%", l: "Max vault utilisation" },
              { v: "40%", l: "Max borrow LTV" },
              { v: "1%", l: "Advance fee to LPs" },
              { v: "0", l: "Days between claim and reinvest" },
            ].map((s) => (
              <div key={s.l}>
                <div className="num text-4xl font-extrabold tracking-tightest text-cyan">{s.v}</div>
                <div className="mt-2 text-micro font-bold uppercase text-paper/60">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Article + side cards */}
      <section className="shell py-24 md:py-36">
        <Eyebrow className="text-cyan-dark">Today&apos;s dividend market</Eyebrow>
        <div className="mt-6 grid gap-12 lg:grid-cols-12">
          <article className="min-w-0 lg:col-span-7">
            <h2 className="text-display font-extrabold">Why dividends are still broken</h2>
            <div className="mt-7 space-y-5 text-[16px] leading-relaxed text-ink/85">
              <p>
                A dividend is the oldest promise in finance. A company earns money and hands some of
                it back. The promise still works. The plumbing does not.
              </p>
              <p>
                The shares go ex on a Monday. The company pays on a Friday three weeks later. In
                between, the money exists, is owed to you, and does nothing. It sits in a ledger at
                a transfer agent while you wait. That gap is not a law of nature. It is a settlement
                convention from an era of paper certificates.
              </p>
              <p>
                Then the money arrives as a lump. One payment, four times a year. Nothing about your
                life is quarterly, but your income from a stock is, because that is how often a
                board meets.
              </p>
              <p>
                Reinvestment is worse. Robinhood documents its own DRIP terms plainly: reinvestment
                happens on the trading day after the pay date, during market hours, subject to a
                midnight cutoff, and the fractional share you receive cannot leave the app. Every one
                of those limits comes from the same place. The dividend never touched a system that
                could act on it immediately.
              </p>
              <p>
                Put the stock token onchain and every limit becomes optional. The ex date snapshot is
                a checkpoint. The three week wait is a credit problem, and credit is what a vault is
                for. The lump is an accounting choice, and per second accrual is cheaper to compute
                than a quarterly batch. The reinvestment delay is a market hours artefact, and a pool
                does not keep office hours.
              </p>
              <p>
                And once the stock lives onchain, it can finally do what collateral has always done
                on Wall Street: back a loan. Osinko is the Aave of dividends. One deposit streams
                income and secures credit at once, and the dividends the collateral keeps earning
                are applied straight against the interest. The oldest private-banking product,
                minus the private banker.
              </p>
              <p className="text-[17px] font-bold">
                Nothing here is a new financial instrument. It is the same dividend, finally put to
                work.
              </p>
            </div>
          </article>

          <aside className="min-w-0 space-y-6 lg:col-span-5">
            <Card>
              <Eyebrow className="text-muted">Side by side</Eyebrow>
              <h3 className="mt-3 text-xl font-extrabold tracking-tighter">Same name, next generation</h3>
              <div className="mt-5 overflow-x-auto">
                <table className="data-table text-[13px]">
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Today</th>
                    <th className="text-cyan-dark">OSINKO</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.term}>
                      <td className="font-bold">{row.term}</td>
                      <td className="text-muted">{row.them}</td>
                      <td className="font-semibold">{row.us}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <Eyebrow className="text-muted">For liquidity providers</Eyebrow>
              <h3 className="mt-3 text-xl font-extrabold tracking-tighter">The other side of early</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                One pool of USDG funds both sides: it fronts dividends for one percent and lends
                against portfolios at a floating rate. Advances are capped at eighty percent of
                assets and every advance is repaid at the pay date. Two revenue streams, one vault.
              </p>
              <Link href="/app/vault" className="btn-accent btn-sm mt-5">
                Open the vault
              </Link>
            </Card>

            <Card>
              <Eyebrow className="text-muted">For agents</Eyebrow>
              <h3 className="mt-3 text-xl font-extrabold tracking-tighter">Drive it from a sentence</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Six MCP tools cover the protocol. Reads answer without a signature. Writes come back
                as unsigned transactions for the wallet to approve. An agent can manage a dividend
                strategy and still never hold a key.
              </p>
              <Link href="/app/agent" className="btn-ghost btn-sm mt-5">
                Open the console
              </Link>
            </Card>
          </aside>
        </div>
      </section>

      {/* Closing */}
      <section className="rule-t">
        <div className="shell flex flex-wrap items-center justify-between gap-6 py-24 md:py-32">
          <h2 className="max-w-2xl text-display font-extrabold">
            Let the dividends do the work
          </h2>
          <Link href="/app" className="btn-primary">
            Start on testnet
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
