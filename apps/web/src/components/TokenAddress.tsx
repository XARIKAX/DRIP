import { explorerAddress } from "@/lib/chain.config";
import { OSINKO_ADDRESS, OSINKO_SYMBOL } from "@/lib/token";
import { CopyButton } from "@/components/CopyButton";

/**
 * The contract address, stated once.
 *
 * A server component on purpose. A token address is the one string on the page a
 * visitor is going to move into a wallet, and it is also the string people search for,
 * so it belongs in the document itself rather than arriving after hydration. Only the
 * copy control is client-side, which makes copying an enhancement rather than the
 * means of reading it.
 *
 * Set full length and never elided — an address truncated to its ends cannot be checked
 * against the one in a wallet — in the mono face, with `.num` slashing the zeros so an
 * O and a 0 cannot be confused.
 *
 * The explorer link appears only when the configured chain has one. A dead link beside
 * a contract address is worse than no link.
 */
export function TokenAddress({ className = "" }: { className?: string }) {
  const href = explorerAddress(OSINKO_ADDRESS);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="serial">{OSINKO_SYMBOL} contract</span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-nano font-medium uppercase text-muted transition-colors duration-300 hover:text-accent"
          >
            Explorer ↗
          </a>
        )}
      </div>

      <div className="mt-3 rounded-md border border-line bg-ground-2 px-3.5 py-3">
        <span className="num block break-all text-[11px] leading-[1.5] text-ink">
          {OSINKO_ADDRESS}
        </span>
        <CopyButton
          value={OSINKO_ADDRESS}
          label={`Copy the ${OSINKO_SYMBOL} contract address`}
          className="mt-2 block"
        />
      </div>
    </div>
  );
}
