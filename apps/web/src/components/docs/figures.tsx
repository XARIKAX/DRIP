"use client";

import type { ReactNode } from "react";

/**
 * The diagrams in the documentation.
 *
 * Every figure is an inline SVG in the same vocabulary as the mechanism scene on the
 * landing page: graph paper registration marks, mono labels, hairline boxes, one cyan
 * accent for whatever is live or moving. They are drawn at an 860 unit width and
 * scale with the column, so label sizes are set for legibility at the narrowest
 * column they will ever be rendered in, not the widest.
 */

const MONO = "IBM Plex Mono, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "Archivo, Helvetica Neue, Helvetica, Arial, sans-serif";

const INK = "#F3F6F8";
const MUTED = "#8B949C";
const FAINT = "#5A636B";
const CYAN = "#35C2DB";
const RED = "#E0644F";
const BOX = "#0B0E11";
const BOX_2 = "#101419";
const LINE = "rgba(255,255,255,0.16)";
const LINE_SOFT = "rgba(255,255,255,0.08)";

function Frame({
  w = 860,
  h,
  label,
  children,
}: {
  w?: number;
  h: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <marker id="doc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={MUTED} />
        </marker>
        <marker id="doc-arrow-cyan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={CYAN} />
        </marker>
        <pattern id="doc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={RED} strokeWidth="1.2" opacity="0.7" />
        </pattern>
      </defs>
      {children}
    </svg>
  );
}

/** Registration marks. The graph paper every figure is drawn on. */
function Regs({ points }: { points: [number, number][] }) {
  return (
    <g stroke="rgba(255,255,255,0.14)" strokeWidth="1">
      {points.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
        </g>
      ))}
    </g>
  );
}

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  sub2,
  dashed = false,
  accent = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  sub2?: string;
  dashed?: boolean;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={dashed ? "transparent" : BOX}
        stroke={accent ? "rgba(53,194,219,0.5)" : LINE}
        strokeWidth="1.2"
        strokeDasharray={dashed ? "4 4" : undefined}
      />
      {accent ? <rect x={x} y={y} width="3" height={h} fill={CYAN} /> : null}
      <text x={x + 16} y={y + 27} fill={dashed ? MUTED : INK} fontSize="15" fontFamily={SANS} fontWeight="700" letterSpacing="-0.3">
        {title}
      </text>
      {sub ? (
        <text x={x + 16} y={y + 47} fill={FAINT} fontSize="11" fontFamily={MONO} letterSpacing="1.2">
          {sub}
        </text>
      ) : null}
      {sub2 ? (
        <text x={x + 16} y={y + 64} fill={FAINT} fontSize="11" fontFamily={MONO} letterSpacing="1.2">
          {sub2}
        </text>
      ) : null}
    </g>
  );
}

function Label({
  x,
  y,
  children,
  anchor = "start",
  color = FAINT,
  size = 10.5,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
  color?: string;
  size?: number;
}) {
  return (
    <text x={x} y={y} fill={color} fontSize={size} fontFamily={MONO} letterSpacing="1.6" textAnchor={anchor}>
      {children}
    </text>
  );
}

function Arrow({ d, cyan = false, dashed = false }: { d: string; cyan?: boolean; dashed?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={cyan ? CYAN : MUTED}
      strokeWidth="1.3"
      strokeDasharray={dashed ? "4 4" : undefined}
      markerEnd={cyan ? "url(#doc-arrow-cyan)" : "url(#doc-arrow)"}
      opacity={cyan ? 0.95 : 0.8}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Architecture — where the money goes                                  */
/* ------------------------------------------------------------------------ */

export function ArchitectureFigure() {
  return (
    <Frame
      h={560}
      label="Money flow through the protocol: an oracle declares into the registry; a holder deposits stock into DripCore; DripCore books advances with the vault and opens streams in the stream engine; streams pay the wallet or the reinvestor, which buys stock and credits it back to DripCore."
    >
      <Regs points={[[40, 300], [820, 300], [560, 540]]} />

      {/* Oracle */}
      <Label x={24} y={64}>
        CORPORATE ACTION ORACLE
      </Label>
      <Label x={24} y={80} color="rgba(90,99,107,0.8)" size={9.5}>
        ORACLE_ROLE
      </Label>
      <Arrow d="M206,58 L298,58" />
      <Label x={252} y={50} anchor="middle" size={9}>
        DECLARE · VOID
      </Label>

      <Box x={300} y={24} w={240} h={68} title="DividendRegistry" sub="DECLARED → SETTLED | VOIDED" />
      <Box x={640} y={24} w={196} h={96} title="AdvanceVault" sub="USDG · ERC-4626 · LPs" sub2="cash floor · 80% cap" accent />

      {/* Registry → DripCore */}
      <Arrow d="M420,92 L420,128" />
      <Label x={410} y={114} anchor="end" size={9.5}>
        STATUS · EX DATE · PAY DATE
      </Label>

      {/* Stock wallet → DripCore */}
      <Box x={24} y={150} w={140} h={76} title="Your wallet" sub="stock tokens" />
      <Arrow d="M164,188 L298,188" />
      <Label x={231} y={178} anchor="middle" size={9}>
        DEPOSIT · WITHDRAW
      </Label>
      <Label x={231} y={202} anchor="middle" size={9}>
        SETMODE
      </Label>

      <Box x={300} y={130} w={240} h={110} title="DripCore" sub="custody · ex date checkpoints" sub2="entitlements · routing · settlement" accent />

      {/* DripCore ↔ Vault. Labels run along the vertical legs, where there is room. */}
      <Arrow d="M540,160 L590,160 L590,60 L638,60" />
      <text
        transform="rotate(-90 581 108)"
        x="581"
        y="108"
        fill={FAINT}
        fontSize="9.5"
        fontFamily={MONO}
        letterSpacing="1.6"
        textAnchor="middle"
      >
        BOOKADVANCE · FEE
      </text>
      <Arrow d="M640,84 L610,84 L610,200 L542,200" />
      <text
        transform="rotate(-90 622 142)"
        x="622"
        y="142"
        fill={FAINT}
        fontSize="9.5"
        fontFamily={MONO}
        letterSpacing="1.6"
        textAnchor="middle"
      >
        REPAYADVANCE
      </text>

      {/* DripCore → StreamEngine */}
      <Arrow d="M420,240 L420,328" cyan />
      <Label x={430} y={262} color={CYAN}>
        ACTIVATE → STARTSTREAM (NET)
      </Label>

      {/* Vault → StreamEngine cash */}
      <Arrow d="M738,120 L738,292 L480,292 L480,328" />
      <Label x={746} y={214} size={9.5}>
        RELEASEADVANCE
      </Label>
      <Label x={746} y={227} size={9.5}>
        PER CLAIM
      </Label>

      <Box x={300} y={330} w={240} h={90} title="StreamEngine" sub="accrues per second, ex → pay" sub2="claim · claimFor · cancel" />

      {/* StreamEngine → USDG wallet */}
      <Arrow d="M540,375 L638,375" cyan />
      <Label x={589} y={365} anchor="middle" size={8.5} color={CYAN}>
        CLAIM · STREAM
      </Label>
      <Box x={640} y={330} w={196} h={90} title="Your wallet" sub="USDG, per second" sub2="or all at once at ex" />

      {/* StreamEngine → Reinvestor */}
      <Arrow d="M300,375 L166,375" cyan />
      <Label x={233} y={365} anchor="middle" size={8.5} color={CYAN}>
        CLAIM · REINVEST
      </Label>
      <Box x={24} y={330} w={140} h={90} title="Reinvestor" sub="USDG → stock" sub2="slippage guard" />

      {/* Reinvestor → DripCore */}
      <Arrow d="M94,330 L94,270 L260,270 L260,214 L298,214" />
      <Label x={102} y={262} size={9.5}>
        SWAP · CREDITREINVEST
      </Label>

      {/* The modules beside the core */}
      <Box x={300} y={470} w={240} h={60} title="SplitVault" sub="a DripCore holder like any other · §7" dashed />
      <Box x={640} y={470} w={196} h={60} title="LendingPool" sub="specified, not deployed · §6" dashed />
      <Label x={24} y={492}>
        ALSO ON THE
      </Label>
      <Label x={24} y={507}>
        BALANCE SHEET
      </Label>

      <line x1="24" y1="548" x2="836" y2="548" stroke={LINE_SOFT} />
      <Label x={24} y={559} size={9.5}>
        ONLY PROTOCOL CONTRACTS MOVE PROTOCOL MONEY. HUMAN ROLES FEED DATA, PAY MONEY IN, OR PUSH IT TO ITS OWNER.
      </Label>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Timeline — the life of one dividend                                  */
/* ------------------------------------------------------------------------ */

export function TimelineFigure() {
  const y = 170;
  return (
    <Frame
      h={300}
      label="A dividend's timeline: declared, then the ex date snapshot, then a stream from the ex date to the pay date, when the issuer settles. A voided dividend branches into clawback."
    >
      <Regs points={[[40, 40], [820, 260]]} />

      {/* Eligibility window */}
      <rect x="60" y="70" width="330" height="100" fill="rgba(53,194,219,0.06)" />
      <Label x={72} y={92} color={CYAN} size={9.5}>
        DEPOSIT BEFORE THIS LINE TO BE ELIGIBLE
      </Label>
      <Label x={72} y={106} size={9.5}>
        ELIGIBILITY IS READ FROM DRIPCORE&apos;S OWN CHECKPOINTS
      </Label>

      {/* The stream */}
      <path d={`M390,${y} L710,88 L710,${y} Z`} fill="rgba(53,194,219,0.12)" />
      <line x1="390" y1={y} x2="710" y2="88" stroke={CYAN} strokeWidth="1.8" />
      <Label x={550} y={112} anchor="middle" color={CYAN}>
        ACCRUES PER SECOND
      </Label>
      <Label x={550} y={126} anchor="middle" size={9.5}>
        CLAIM AT ANY MOMENT
      </Label>

      {/* Early chip */}
      <rect x="396" y="40" width="150" height="22" fill={BOX} stroke="rgba(53,194,219,0.5)" />
      <Label x={471} y={55} anchor="middle" color={CYAN} size={9.5}>
        EARLY · ALL OF IT, −1%
      </Label>
      <line x1="396" y1="62" x2="392" y2={y - 4} stroke="rgba(53,194,219,0.4)" strokeDasharray="2 3" />

      {/* Axis */}
      <line x1="60" y1={y} x2="800" y2={y} stroke={LINE} />
      {[
        [140, "DECLARE", "ORACLE_ROLE"],
        [390, "EX DATE", "SNAPSHOT SECOND"],
        [710, "PAY DATE", "ISSUER SETTLES"],
      ].map(([x, t, s]) => (
        <g key={t}>
          <line x1={x} y1={y - 8} x2={x} y2={y + 8} stroke={INK} strokeWidth="1.4" />
          <text x={Number(x)} y={y + 30} fill={INK} fontSize="12" fontFamily={MONO} fontWeight="500" letterSpacing="1.6" textAnchor="middle">
            {t}
          </text>
          <Label x={Number(x)} y={y + 45} anchor="middle" size={9.5}>
            {s}
          </Label>
        </g>
      ))}

      {/* Window bracket */}
      <path d="M390,232 L390,240 L710,240 L710,232" fill="none" stroke={LINE} />
      <Label x={550} y={256} anchor="middle" size={9.5}>
        ≤ 90 DAYS · MAX_SETTLEMENT_WINDOW
      </Label>

      {/* Settlement */}
      <Label x={800} y={y - 14} anchor="end" size={9.5}>
        SETTLEDIVIDEND → VAULT REPAID
      </Label>
      <Label x={800} y={y - 1} anchor="end" size={9.5}>
        CLAIMSETTLED, NO FEE, FOR THE REST
      </Label>

      {/* Void branch */}
      <Arrow d="M470,178 L560,270" dashed />
      <Label x={568} y={276} color={RED} size={9.5}>
        VOIDED → CLAWBACK PER HOLDER
      </Label>
      <Label x={568} y={289} size={9.5}>
        CANCEL STREAM · SEIZE STOCK · WRITE OFF
      </Label>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Checkpoint — how eligibility is proved                               */
/* ------------------------------------------------------------------------ */

export function CheckpointFigure() {
  const base = 250;
  const yFor = (bal: number) => base - bal * 0.9;
  const ex = 440;
  return (
    <Frame
      h={330}
      label="A holder's deposited balance over time, stepping at each deposit and withdrawal. The ex date falls while the balance is 150, so the entitlement is 150 shares times the per share amount, whatever happens afterwards."
    >
      <Regs points={[[40, 40], [820, 300]]} />

      {/* Axes */}
      <line x1="80" y1="60" x2="80" y2={base} stroke={LINE} />
      <line x1="80" y1={base} x2="800" y2={base} stroke={LINE} />
      <Label x={62} y={base + 4} anchor="end" size={9.5}>
        0
      </Label>
      <Label x={62} y={yFor(150) + 4} anchor="end" size={9.5}>
        150
      </Label>
      <line x1="80" y1={yFor(150)} x2="800" y2={yFor(150)} stroke={LINE_SOFT} strokeDasharray="2 4" />

      {/* Balance steps */}
      <path
        d={`M80,${base} L80,${yFor(100)} L260,${yFor(100)} L260,${yFor(150)} L580,${yFor(150)} L580,${yFor(120)} L800,${yFor(120)}`}
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
      />
      <path d={`M80,${yFor(100)} L260,${yFor(100)} L260,${yFor(150)} L580,${yFor(150)} L580,${yFor(120)} L800,${yFor(120)} L800,${base} L80,${base} Z`} fill="rgba(255,255,255,0.03)" />

      {/* Checkpoints. Deposits are labelled above their step, the withdrawal below
          its own, so no label sits on the balance line or under the proof box. */}
      {[
        [80, 100, "DEPOSIT 100.0000", -1],
        [260, 150, "DEPOSIT 50.0000", -1],
        [580, 120, "WITHDRAW 30.0000", 1],
      ].map(([x, bal, t, dir]) => {
        const cy = yFor(Number(bal));
        const y1 = dir === -1 ? cy - 24 : cy + 20;
        const y2 = dir === -1 ? cy - 11 : cy + 33;
        return (
          <g key={String(t)}>
            <circle cx={Number(x)} cy={cy} r="4" fill={BOX} stroke={INK} strokeWidth="1.5" />
            <Label x={Number(x) + 10} y={y1} size={9.5} color={MUTED}>
              {t}
            </Label>
            <Label x={Number(x) + 10} y={y2} size={9.5}>
              CHECKPOINT WRITTEN
            </Label>
          </g>
        );
      })}

      {/* Ex date */}
      <line x1={ex} y1="56" x2={ex} y2={base} stroke={CYAN} strokeWidth="1.6" strokeDasharray="4 4" />
      <circle cx={ex} cy={yFor(150)} r="6" fill={CYAN} />
      <rect x={ex - 60} y="30" width="120" height="22" fill={BOX} stroke="rgba(53,194,219,0.5)" />
      <Label x={ex} y={45} anchor="middle" color={CYAN} size={9.5}>
        EX DATE SECOND
      </Label>

      {/* The proof */}
      <rect x="520" y="72" width="270" height="86" fill={BOX} stroke={LINE} />
      <rect x="520" y="72" width="3" height="86" fill={CYAN} />
      <text x="536" y="96" fill={INK} fontSize="12.5" fontFamily={MONO} fontWeight="500">
        balanceOfAt(you, AAPL, ex) = 150.0000
      </text>
      <text x="536" y="118" fill={MUTED} fontSize="11.5" fontFamily={MONO}>
        gross = 150 × $0.26 = $39.00
      </text>
      <text x="536" y="140" fill={CYAN} fontSize="11.5" fontFamily={MONO}>
        net after the 1% advance fee = $38.61
      </text>

      <Label x={600} y={base + 24} size={9.5}>
        THE WITHDRAWAL AFTER EX CHANGES NOTHING
      </Label>
      <Label x={80} y={base + 24} size={9.5}>
        TIME →
      </Label>
      <Label x={80} y={base + 40} size={9.5} color="rgba(90,99,107,0.8)">
        OPENZEPPELIN CHECKPOINTS.TRACE208, KEYED BY TIMESTAMP, WRITTEN ON EVERY BALANCE CHANGE
      </Label>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Vault — the accounting identity                                      */
/* ------------------------------------------------------------------------ */

export function VaultFigure() {
  // Stylised numbers: cash 500, receivables 400, obligations 300 → assets 600.
  const x0 = 250;
  const scale = 0.55;
  const rows: [string, number, string, "pos" | "neg" | "sum"][] = [
    ["CASH", 500, "USDG in the vault", "pos"],
    ["RECEIVABLES", 400, "gross owed by issuers at pay dates", "pos"],
    ["OBLIGATIONS", 300, "net still owed to holders who advanced", "neg"],
    ["TOTAL ASSETS", 600, "what LP shares are priced on", "sum"],
  ];
  return (
    <Frame
      h={330}
      label="The vault's balance sheet as four bars: cash plus receivables minus obligations equals total assets. Two checks below: cash covers obligations, and receivables sit under the utilisation cap."
    >
      <Regs points={[[40, 40], [820, 300]]} />
      {rows.map(([name, v, note, kind], i) => {
        const y = 44 + i * 46;
        const w = v * scale;
        return (
          <g key={name}>
            <text x="24" y={y + 17} fill={kind === "sum" ? INK : MUTED} fontSize="11.5" fontFamily={MONO} fontWeight="500" letterSpacing="1.4">
              {kind === "neg" ? "− " : kind === "sum" ? "= " : i === 0 ? "  " : "+ "}
              {name}
            </text>
            {kind === "neg" ? (
              <rect x={x0} y={y} width={w} height="26" fill="url(#doc-hatch)" stroke={RED} strokeWidth="1" opacity="0.9" />
            ) : (
              <rect x={x0} y={y} width={w} height="26" fill={kind === "sum" ? CYAN : "rgba(243,246,248,0.14)"} stroke={kind === "sum" ? CYAN : LINE} />
            )}
            <text x={x0 + w + 10} y={y + 17} fill={kind === "sum" ? CYAN : INK} fontSize="12" fontFamily={MONO} fontWeight="500">
              {v.toLocaleString()}
            </text>
            <Label x={x0 + w + 62} y={y + 17} size={9.5}>
              {note}
            </Label>
            {i === 2 ? <line x1={x0} y1={y + 36} x2={x0 + 600 * scale} y2={y + 36} stroke={LINE} /> : null}
          </g>
        );
      })}

      {/* The two admission checks */}
      <line x1="24" y1="236" x2="836" y2="236" stroke={LINE_SOFT} />
      <Label x={24} y={258} color={INK} size={10.5}>
        CHECK 1 · CASH FLOOR
      </Label>
      <text x="24" y="278" fill={MUTED} fontSize="11.5" fontFamily={MONO}>
        cash ≥ obligations → 500 ≥ 300
      </text>
      <text x="300" y="278" fill={CYAN} fontSize="11.5" fontFamily={MONO}>
        ✓ every promised holder is payable today
      </text>

      <Label x={24} y={302} color={INK} size={10.5}>
        CHECK 2 · UTILISATION CAP
      </Label>
      <text x="24" y="322" fill={MUTED} fontSize="11.5" fontFamily={MONO}>
        receivables / assets = 66.7% ≤ 80%
      </text>
      <rect x="300" y="312" width="300" height="6" fill={BOX_2} />
      <rect x="300" y="312" width={300 * 0.667} height="6" fill={CYAN} />
      <rect x={300 + 300 * 0.8 - 1} y="308" width="2" height="14" fill={INK} />
      <Label x={608} y={322} size={9.5}>
        CAP 80% · ADMIN CEILING 95%
      </Label>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Stream — accrual against the wall clock                              */
/* ------------------------------------------------------------------------ */

export function StreamFigure() {
  const x0 = 80;
  const x1 = 780;
  const yBase = 220;
  const yTop = 60;
  const at = (dayFrac: number) => x0 + (x1 - x0) * dayFrac;
  const acc = (dayFrac: number) => yBase - (yBase - yTop) * dayFrac;
  const now = 6 / 21;
  return (
    <Frame
      h={290}
      label="A stream's accrued amount rises in a straight line from the ex date to the pay date. The claimed amount is a staircase beneath it; the gap between them is what is claimable right now."
    >
      <Regs points={[[40, 40], [820, 260]]} />
      <line x1={x0} y1={yBase} x2={x1} y2={yBase} stroke={LINE} />
      <line x1={x0} y1={yBase} x2={x0} y2={yTop - 10} stroke={LINE} />

      {/* Future, faint */}
      <line x1={at(now)} y1={acc(now)} x2={x1} y2={yTop} stroke={LINE} strokeDasharray="3 5" />
      {/* Accrued so far */}
      <path d={`M${x0},${yBase} L${at(now)},${acc(now)} L${at(now)},${yBase} Z`} fill="rgba(53,194,219,0.10)" />
      <line x1={x0} y1={yBase} x2={at(now)} y2={acc(now)} stroke={CYAN} strokeWidth="1.8" />

      {/* Claimed staircase: one claim on day 4 */}
      <path d={`M${x0},${yBase} L${at(4 / 21)},${yBase} L${at(4 / 21)},${acc(4 / 21)} L${at(now)},${acc(4 / 21)}`} fill="none" stroke={INK} strokeWidth="1.5" />
      <circle cx={at(4 / 21)} cy={acc(4 / 21)} r="4" fill={BOX} stroke={INK} strokeWidth="1.5" />
      <Label x={at(4 / 21) + 10} y={acc(4 / 21) + 18} size={9.5} color={MUTED}>
        CLAIMED ON DAY 4 · $34.43
      </Label>

      {/* Claimable gap */}
      <line x1={at(now)} y1={acc(now)} x2={at(now)} y2={acc(4 / 21)} stroke={CYAN} strokeWidth="1.5" />
      <rect x={at(now) + 12} y={acc(now) - 4} width="188" height="40" fill={BOX} stroke="rgba(53,194,219,0.5)" />
      <text x={at(now) + 24} y={acc(now) + 13} fill={CYAN} fontSize="11.5" fontFamily={MONO} fontWeight="500">
        claimable = accrued − claimed
      </text>
      <text x={at(now) + 24} y={acc(now) + 29} fill={MUTED} fontSize="11" fontFamily={MONO}>
        today · day 6 of 21
      </text>

      {/* Today marker */}
      <line x1={at(now)} y1={acc(now) - 4} x2={at(now)} y2={yBase} stroke="rgba(53,194,219,0.35)" strokeDasharray="2 4" />

      {[
        [x0, "EX DATE", "STREAM OPENS"],
        [x1, "PAY DATE", "STREAM ENDS · TOTAL REACHED"],
      ].map(([x, t, s]) => (
        <g key={t}>
          <line x1={x} y1={yBase - 6} x2={x} y2={yBase + 6} stroke={INK} strokeWidth="1.4" />
          <text x={Number(x)} y={yBase + 26} fill={INK} fontSize="12" fontFamily={MONO} fontWeight="500" letterSpacing="1.6" textAnchor={x === x0 ? "start" : "end"}>
            {t}
          </text>
          <Label x={Number(x)} y={yBase + 41} anchor={x === x0 ? "start" : "end"} size={9.5}>
            {s}
          </Label>
        </g>
      ))}

      <text x={x1} y={yTop - 16} fill={INK} fontSize="12" fontFamily={MONO} fontWeight="500" textAnchor="end">
        total $180.77
      </text>
      <Label x={x1} y={yTop - 2} anchor="end" size={9.5}>
        220 MSFT × $0.83 × 0.99
      </Label>

      <text x="24" y="276" fill={MUTED} fontSize="11.5" fontFamily={MONO}>
        accrued(t) = total × (t − start) / (end − start)  →  $8.608 / day · $0.3587 / hour · $0.0000996 / second
      </text>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Loan to value — the three bands                                      */
/* ------------------------------------------------------------------------ */

export function LtvFigure({ ltvPct, healthFactor }: { ltvPct: number; healthFactor: number }) {
  const x0 = 60;
  const x1 = 800;
  const at = (pct: number) => x0 + ((x1 - x0) * Math.min(Math.max(pct, 0), 100)) / 100;
  const y = 110;
  const live = Number.isFinite(ltvPct) && ltvPct > 0;
  return (
    <Frame
      h={250}
      label="The loan to value scale. Up to 40 percent can be drawn. Between 40 and 65 percent nothing new can be borrowed and nothing is liquidated. Past 65 percent a liquidator may repay up to half the debt and take collateral plus a five percent bonus."
    >
      <Regs points={[[40, 30], [820, 230]]} />

      <rect x={at(0)} y={y} width={at(40) - at(0)} height="28" fill="rgba(53,194,219,0.22)" stroke="rgba(53,194,219,0.6)" />
      <rect x={at(40)} y={y} width={at(65) - at(40)} height="28" fill="rgba(255,255,255,0.05)" stroke={LINE} />
      <rect x={at(65)} y={y} width={at(100) - at(65)} height="28" fill="url(#doc-hatch)" stroke={RED} opacity="0.9" />

      <Label x={at(0)} y={y - 30} color={CYAN}>
        BORROWABLE
      </Label>
      <Label x={at(0)} y={y - 16} size={9.5}>
        DRAW UP TO 40% OF COLLATERAL VALUE
      </Label>

      <Label x={at(40) + 8} y={y - 30} color={INK}>
        BUFFER
      </Label>
      <Label x={at(40) + 8} y={y - 16} size={9.5}>
        NO NEW DRAWS · NO LIQUIDATION
      </Label>

      <Label x={at(65) + 8} y={y - 30} color={RED}>
        LIQUIDATION
      </Label>
      <Label x={at(65) + 8} y={y - 16} size={9.5}>
        REPAY ≤ 50% · SEIZE + 5% BONUS
      </Label>

      {[0, 40, 65, 100].map((p) => (
        <g key={p}>
          <line x1={at(p)} y1={y + 28} x2={at(p)} y2={y + 38} stroke={INK} />
          <text x={at(p)} y={y + 54} fill={INK} fontSize="12" fontFamily={MONO} fontWeight="500" textAnchor="middle">
            {p}%
          </text>
        </g>
      ))}

      {live ? (
        <g>
          <line x1={at(ltvPct)} y1={y - 6} x2={at(ltvPct)} y2={y + 34} stroke={CYAN} strokeWidth="2" />
          <circle cx={at(ltvPct)} cy={y - 8} r="3.5" fill={CYAN} />
          <text x={at(ltvPct)} y={y + 86} fill={CYAN} fontSize="11.5" fontFamily={MONO} fontWeight="500" textAnchor={ltvPct > 80 ? "end" : "start"}>
            THIS PORTFOLIO · {ltvPct.toFixed(1)}% DRAWN · HEALTH FACTOR {Number.isFinite(healthFactor) ? healthFactor.toFixed(2) : "∞"}
          </text>
        </g>
      ) : (
        <Label x={x0} y={y + 86} size={9.5}>
          NOTHING BORROWED · HEALTH FACTOR ∞
        </Label>
      )}

      <text x="60" y="226" fill={MUTED} fontSize="11.5" fontFamily={MONO}>
        health factor = collateral value × 0.65 / debt   ·   below 1.00 the position is liquidatable
      </text>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Split — principal and yield                                          */
/* ------------------------------------------------------------------------ */

export function SplitFigure() {
  return (
    <Frame
      h={400}
      label="One stock token is split into a principal token and a yield token. The principal token redeems for the stock at maturity; the yield token collects every dividend harvested before then. Equal amounts of both merge back into the whole token, free, at any time."
    >
      <Regs points={[[40, 40], [820, 370]]} />

      <Box x={24} y={160} w={176} h={82} title="Stock token" sub="1.0000 · in your wallet" />

      {/* Split node */}
      <Arrow d="M200,201 L262,201" cyan />
      <rect x="264" y="176" width="112" height="50" fill={BOX} stroke="rgba(53,194,219,0.5)" />
      <text x="320" y="197" fill={INK} fontSize="13" fontFamily={SANS} fontWeight="700" textAnchor="middle">
        split
      </text>
      <Label x={320} y={214} anchor="middle" color={CYAN} size={9.5}>
        FEE 10 BPS
      </Label>

      {/* To PT and YT */}
      <Arrow d="M376,190 L410,190 L410,96 L438,96" cyan />
      <Arrow d="M376,212 L410,212 L410,306 L438,306" cyan />
      <Label x={418} y={150} size={9.5}>
        0.9990
      </Label>
      <Label x={418} y={262} size={9.5}>
        0.9990
      </Label>

      <Box x={440} y={54} w={200} h={84} title="Principal Token" sub="the share, minus the drip" sub2="1:1 for stock at maturity" accent />
      <Box x={440} y={264} w={200} h={84} title="Yield Token" sub="the drip, on its own" sub2="checkpointed per transfer" accent />

      {/* Outcomes */}
      <Arrow d="M640,96 L700,96" />
      <rect x="702" y="62" width="134" height="68" fill="transparent" stroke={LINE} strokeDasharray="4 4" />
      <Label x={714} y={86} color={INK}>
        AT MATURITY
      </Label>
      <Label x={714} y={102} size={9.5}>
        REDEEMPRINCIPAL
      </Label>
      <Label x={714} y={116} size={9.5}>
        → 1.0000 STOCK
      </Label>

      <Arrow d="M640,306 L700,306" />
      <rect x="702" y="264" width="134" height="84" fill="transparent" stroke={LINE} strokeDasharray="4 4" />
      <Label x={714} y={288} color={INK}>
        EVERY EX DATE
      </Label>
      <Label x={714} y={304} size={9.5}>
        HARVEST → POOL
      </Label>
      <Label x={714} y={318} size={9.5}>
        CLAIM PRO RATA BY
      </Label>
      <Label x={714} y={332} size={9.5}>
        BALANCEOFAT(EX)
      </Label>

      {/* Merge, the return path */}
      <Arrow d="M540,348 L540,372 L112,372 L112,244" />
      <Label x={326} y={364} anchor="middle" color={INK}>
        MERGE · EQUAL PT + YT → THE WHOLE TOKEN · FREE · ANY TIME
      </Label>

      {/* The custody note */}
      <Label x={24} y={30} size={9.5}>
        THE STOCK SITS IN DRIPCORE UNDER SPLITVAULT&apos;S ADDRESS, IN CASH_EARLY MODE, UNTIL PT OR PT+YT IS REDEEMED
      </Label>
      <Label x={24} y={44} size={9.5} color="rgba(90,99,107,0.8)">
        INVARIANT · DRIPCORE.BALANCEOF(SPLITVAULT, STOCK) == PT.TOTALSUPPLY() · ONE ACTIVE SERIES PER STOCK TOKEN
      </Label>
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* Fig. Lifecycle — the registry's state machine                             */
/* ------------------------------------------------------------------------ */

export function LifecycleFigure() {
  return (
    <Frame h={200} label="Dividend lifecycle: declared by the oracle, then either settled when the issuer pays or voided, which triggers clawback.">
      <Regs points={[[40, 30], [820, 170]]} />
      <Box x={24} y={64} w={150} h={64} title="—" sub="nothing declared" />
      <Arrow d="M174,96 L250,96" />
      <Label x={212} y={86} anchor="middle" size={9.5}>
        DECLAREDIVIDEND
      </Label>
      <Label x={212} y={112} anchor="middle" size={9.5} color="rgba(90,99,107,0.8)">
        ORACLE_ROLE
      </Label>

      <Box x={252} y={64} w={190} h={64} title="DECLARED" sub="advances may be drawn" accent />

      <Arrow d="M442,84 L560,50" cyan />
      <Label x={500} y={54} anchor="middle" size={9.5} color={CYAN}>
        SETTLEDIVIDEND · KEEPER PAYS USDG
      </Label>
      <Box x={562} y={16} w={180} h={64} title="SETTLED" sub="vault repaid · claimSettled" />

      <Arrow d="M442,108 L560,142" dashed />
      <Label x={500} y={146} anchor="middle" size={9.5} color={RED}>
        VOIDDIVIDEND · ORACLE_ROLE
      </Label>
      <Box x={562} y={112} w={180} h={64} title="VOIDED" sub="clawback per holder" dashed />

      <Arrow d="M742,144 L780,144" />
      <Label x={786} y={140} size={9.5} color={RED}>
        SEIZE
      </Label>
      <Label x={786} y={153} size={9.5}>
        WRITE OFF
      </Label>
    </Frame>
  );
}
