import Link from "next/link";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { TickerStrip } from "@/components/TickerStrip";
import { Footer } from "@/components/Footer";
import { HeroCounter } from "@/components/HeroCounter";
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
    name: "DRIP",
    line: "Reinvested the moment it lands.",
    body: "Every claim swaps straight into more of the same stock token and returns to your position. The cash never touches your wallet. The next dividend is calculated on a bigger balance.",
    stat: "Same block",
  },
  {
    index: "04",
    name: "Agent",
    line: "Your strategy, in a sentence.",
    body: "Every action is exposed over MCP. Tell an agent to stream half and compound half and it builds the transactions. You sign them. Nothing executes without you.",
    stat: "6 MCP tools",
  },
];

const STATS = [
  { label: "Days early you get paid", value: "21" },
  { label: "Advance fee", value: "1.00%" },
  { label: "Stream resolution", value: "1s" },
  { label: "Reinvest delay", value: "0" },
];

const COMPARISON = [
  { term: "Reinvestment timing", them: "Trading day after pay date", us: "Same transaction as the claim" },
  { term: "Hours", them: "Market hours, midnight cutoff", us: "Every second of every day" },
  { term: "Fractional shares", them: "Locked inside the app", us: "Self custodied ERC-20" },
  { term: "Cash timing", them: "Pay date, weeks after ex", us: "Ex date, minus one percent" },
  { term: "Cadence", them: "Quarterly lump", us: "Continuous stream" },
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
        <div className="shell relative grid gap-12 py-16 md:grid-cols-12 md:py-24">
          <div className="md:col-span-7">
            <Eyebrow className="text-cyan-dark">The dividend layer for Robinhood Chain</Eyebrow>
            <h1 className="mt-5 text-hero font-extrabold">
              Get paid before
              <br />
              Wall Street does
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink/80">
              Stock tokens on Robinhood Chain pay dividends the old way. Offchain. Weeks late. In
              quarterly lumps. Only inside one app. Drip Markets pays you at the ex date, streams the money
              per second, and turns every drop back into stock the moment it lands.
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

          <div className="md:col-span-5">
            <Card className="h-full">
              <Eyebrow className="text-muted">Streaming now, protocol wide</Eyebrow>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="num text-2xl font-semibold text-muted">$</span>
                <span className="text-[clamp(2rem,5vw,3.25rem)] font-extrabold tracking-tightest text-ink">
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
      </section>

      {/* Modules */}
      <section className="shell py-16 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow className="text-cyan-dark">Four modules</Eyebrow>
            <h2 className="mt-3 text-display font-extrabold">One dividend, rebuilt</h2>
          </div>
          <p className="max-w-sm text-[14px] text-muted">
            Each module fixes one thing that is broken. Together they turn a quarterly cheque into
            a continuous, compounding position.
          </p>
        </div>

        <div className="mt-10 grid gap-px border border-ink bg-ink md:grid-cols-2">
          {MODULES.map((m) => (
            <div key={m.index} className="bg-paper p-8 md:p-10">
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
              { v: "1%", l: "Advance fee to LPs" },
              { v: "0", l: "Days between claim and reinvest" },
              { v: "100%", l: "Of state read from chain" },
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
      <section className="shell py-16 md:py-24">
        <Eyebrow className="text-cyan-dark">Today&apos;s dividend market</Eyebrow>
        <div className="mt-6 grid gap-12 lg:grid-cols-12">
          <article className="lg:col-span-7">
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
              <p className="text-[17px] font-bold">
                Nothing here is a new financial instrument. It is the same dividend, paid on time.
              </p>
            </div>
          </article>

          <aside className="space-y-6 lg:col-span-5">
            <Card>
              <Eyebrow className="text-muted">Side by side</Eyebrow>
              <h3 className="mt-3 text-xl font-extrabold tracking-tighter">Same name, next generation</h3>
              <table className="data-table mt-5 text-[13px]">
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Today</th>
                    <th className="text-cyan-dark">$DRIP</th>
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
            </Card>

            <Card>
              <Eyebrow className="text-muted">For liquidity providers</Eyebrow>
              <h3 className="mt-3 text-xl font-extrabold tracking-tighter">The other side of early</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Somebody has to front the money. The advance vault is an ERC-4626 pool of USDG that
                does exactly that and charges one percent for it. Advances are capped at eighty
                percent of assets and every advance is repaid by the issuer at the pay date.
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
        <div className="shell flex flex-wrap items-center justify-between gap-6 py-16">
          <h2 className="max-w-2xl text-display font-extrabold">
            Dividends the way they should work
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
