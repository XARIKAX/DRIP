import { PixelSprite } from "@/components/pixel/Sprite";
import { PetalField } from "@/components/pixel/Petals";
import { COIN, KOI, SAKURA, SAND, STONE, TORII } from "@/components/pixel/palette";
import {
  BAMBOO,
  BRIDGE,
  COIN_SPRITE,
  KOI_FRAMES,
  LANTERN,
  SAPLING,
  STONE_LARGE,
  STONE_MID,
  STONE_SMALL,
  TORII_GATE,
} from "@/components/pixel/sprites";
import { groundGrid, mossGrid, sakuraGrid, sandGrid, scatterGrid } from "@/components/pixel/generate";
import { gridSize, type Grid, type Palette } from "@/components/pixel/raster";
import { toRuns } from "@/components/pixel/raster";

export const metadata = { title: "Pixel lab", robots: { index: false, follow: false } };

/**
 * The pixel lab.
 *
 * Not shipped to anybody — it is where the garden gets art-directed. Every sprite at
 * three scales on a checkerboard, with its dimensions and its rectangle count, because
 * the two ways this system fails are a sprite that reads as mush at 2x and a generator
 * that quietly emits four thousand nodes.
 */

function Cell({ label, grid, palette, scales = [2, 4, 8] }: { label: string; grid: Grid; palette: Palette; scales?: number[] }) {
  const { w, h } = gridSize(grid);
  const runs = toRuns(grid).length;
  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="serial">{label}</span>
        <span className="num text-[11px] text-faint">
          {w}×{h} · {runs} rects · {((runs / (w * h)) * 100).toFixed(0)}% of one-per-pixel
        </span>
      </div>
      <div
        className="mt-5 flex flex-wrap items-end gap-8 rounded-md p-5"
        style={{
          backgroundImage:
            "repeating-conic-gradient(rgb(var(--ground-3)) 0% 25%, rgb(var(--ground)) 0% 50%)",
          backgroundSize: "16px 16px",
        }}
      >
        {scales.map((s) => (
          <PixelSprite key={s} grid={grid} palette={palette} scale={s} title={`${label} at ${s}x`} />
        ))}
      </div>
    </div>
  );
}

export default function PixelLab() {
  return (
    <div className="min-h-screen bg-ground py-16 [--cell:1px]">
      <div className="shell space-y-10">
        <header>
          <p className="eyebrow">Internal</p>
          <h1 className="display mt-3 text-display">Pixel lab</h1>
          <p className="mt-4 max-w-prose text-[15px] text-muted">
            Every sprite in the garden at 2, 4 and 8 cells. A sprite that stops reading at
            2× is drawn too small; a generator over about 400 rectangles is drawn too big.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <Cell label="Stone lantern" grid={LANTERN} palette={STONE} />
          <Cell label="Torii" grid={TORII_GATE} palette={TORII} />
          <Cell label="Bridge" grid={BRIDGE} palette={STONE} />
          <Cell label="Sapling" grid={SAPLING} palette={SAKURA} />
          <Cell label="Bamboo" grid={BAMBOO} palette={SAKURA} />
          <Cell label="Coin" grid={COIN_SPRITE} palette={COIN} />
          <Cell label="Stone · large" grid={STONE_LARGE} palette={STONE} />
          <Cell label="Stone · mid" grid={STONE_MID} palette={STONE} />
          <Cell label="Stone · small" grid={STONE_SMALL} palette={STONE} />
          <Cell label="Koi · frame 1" grid={KOI_FRAMES[0]!} palette={KOI} scales={[3, 6]} />
          <Cell label="Koi · frame 2" grid={KOI_FRAMES[1]!} palette={KOI} scales={[3, 6]} />
          <Cell label="Koi · frame 3" grid={KOI_FRAMES[2]!} palette={KOI} scales={[3, 6]} />
        </section>

        <h2 className="display text-headline">Grown</h2>
        <section className="grid gap-6 md:grid-cols-2">
          {[7, 23, 41, 89, 13, 57].map((seed) => (
            <Cell
              key={seed}
              label={`Sakura · seed ${seed}`}
              grid={sakuraGrid({ seed, w: 56, h: 64, bloom: 5, depth: 5 })}
              palette={SAKURA}
              scales={[2, 4]}
            />
          ))}
          <Cell label="Raked sand" grid={sandGrid({ seed: 3, w: 100, h: 40, pitch: 5, rings: 6, focus: [30, 20] })} palette={SAND} scales={[2, 3]} />
          <Cell label="Moss" grid={mossGrid({ seed: 5, w: 64, h: 8 })} palette={SAKURA} scales={[3, 5]} />
          <Cell label="Fallen petals" grid={scatterGrid({ seed: 7, w: 72, h: 10 })} palette={SAKURA} scales={[3, 5]} />
          <Cell label="Ground line" grid={groundGrid({ seed: 11, w: 110, h: 12 })} palette={SAKURA} scales={[2, 4]} />
        </section>

        <h2 className="display text-headline">Petals</h2>
        <div className="night relative h-[320px] overflow-hidden rounded-xl border border-line bg-ground">
          <PetalField density={4} cell={5} />
        </div>
      </div>
    </div>
  );
}
