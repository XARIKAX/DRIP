import { flipX, mirror, type Grid } from "./raster";

/**
 * The drawn half of the garden.
 *
 * Everything in here is an icon: small enough that a generator cannot be trusted with
 * it, and recognisable enough that being wrong by two pixels reads as being wrong. A
 * lantern that is not obviously a lantern is just noise. The grown half of the garden —
 * trees, sand, moss, scatter — lives in `generate.ts`, because those want variety and
 * hand-drawing the same tree five times would read as a stamp.
 *
 * Symmetric objects are authored as a left half plus the centre column; `mirror` builds
 * the rest, so the symmetry cannot drift.
 */

/** A stone lantern. 21 x 30. Roof, fire box, platform, pillar, base. */
export const LANTERN: Grid = mirror([
  ".........oo",
  "........olo",
  ".........lo",
  ".......oooo",
  ".....ooslll",
  "...ooslllll",
  "..oslllllll",
  ".osllllllll",
  "oosssssssss",
  "..ooooooooo",
  "...ollfffff",
  "...olffffff",
  "...olffFFFF",
  "...olffffff",
  "...ollfffff",
  "..ooooooooo",
  ".osssssssss",
  ".oooooooooo",
  ".......osss",
  ".......osls",
  ".......osls",
  ".......osls",
  ".......osls",
  ".......osls",
  ".......osls",
  "......oosss",
  ".....ooslll",
  "...ooslllll",
  "..ossllllll",
  "..ooooooooo",
]);

/** A torii gate. 25 x 20. Upturned kasagi, nuki beam, two pillars. */
export const TORII_GATE: Grid = mirror([
  "oo...........",
  "ooo..........",
  "ooooooooooooo",
  "ooooooooooooo",
  ".tttttttttttt",
  "....ttt......",
  "....ttt......",
  "..ooooooooooo",
  "..ttttttttttt",
  "....ttt......",
  "....ttt......",
  "....ttt......",
  "....ttt......",
  "....ttt......",
  "....ttt......",
  "....ttt......",
  "....ttt......",
  "....ttt......",
  "...ttttt.....",
  "...ooooo.....",
]);

/** An arched stone bridge. 25 x 10. */
export const BRIDGE: Grid = mirror([
  ".........oooo",
  "......ooooooo",
  "...oooooooooo",
  ".ooosssssssss",
  "oosssssssssss",
  "ossslll......",
  "osslll.......",
  "oslll........",
  "oll..........",
  "oo...........",
]);

/*
 * Three stones, drawn asymmetrically on purpose. A garden stone that is symmetric
 * reads as manufactured, which is the one thing a rock must not do.
 */

/** 13 x 8. */
export const STONE_LARGE: Grid = [
  ".....ooooo...",
  "...oosslllll.",
  "..oossslllll.",
  ".oosssslllll.",
  ".osssssslllll",
  "ossssssssllll",
  "ossssssssslll",
  ".ooooooooooo.",
];

/** 9 x 6. */
export const STONE_MID: Grid = [
  "...ooo...",
  "..osslll.",
  ".ossslll.",
  "osssssll.",
  "ossssssll",
  ".ooooooo.",
];

/** 7 x 4. */
export const STONE_SMALL: Grid = [
  "..ooo..",
  ".osslll",
  "osssll.",
  ".ooooo.",
];

/** A blossom sapling on a patch of moss. 11 x 13. */
export const SAPLING: Grid = [
  "...ccc.....",
  "..ccbcc....",
  ".ccbbbcc...",
  ".ccbbbccc..",
  "..ccbbcc...",
  "...cccc....",
  "....tt.....",
  "....tt.....",
  "...ttt.....",
  "...ttt.....",
  "..tt.tt....",
  ".tt...tt...",
  "mmmmmmmmmmm",
];

/** A bamboo stand. 9 x 18. */
export const BAMBOO: Grid = [
  "..g...g..",
  ".g.g.g.g.",
  "..ttt.g..",
  "..ttt....",
  "..ttt.g..",
  ".gttt.g..",
  "..ttt....",
  "..tttg...",
  "g.ttt.g..",
  "..ttt....",
  ".gttt.g..",
  "..ttt....",
  "..ttt.g..",
  "g.ttt....",
  "..ttt.g..",
  "..ttt....",
  "..ttt....",
  "mmmmmmmmm",
];

/*
 * A koi, in three frames.
 *
 * The swim is a `steps(3)` CSS animation over a strip — no JavaScript, no animation
 * frame, and it stops on its own under reduced motion because the global block turns
 * every keyframe off. The fish faces left; `KOI_RIGHT` is the mirror.
 */

const KOI_A: Grid = [
  "..........k.........",
  ".........kkk........",
  "....kkkkkkkkkk..kkk.",
  "..kkkkKKkkkKkkk.kkk.",
  ".okkkkKKkkkKKkkkkkkk",
  "..kkkkKkkkkKkkk.kkk.",
  "....kkkkkkkkkk..kkk.",
  "......kk...kk.......",
  ".......k............",
];

const KOI_B: Grid = [
  ".........k..........",
  "........kkk.........",
  "....kkkkkkkkkkkkkkk.",
  "..kkkkKKkkkKkkk.kkk.",
  ".okkkkKKkkkKKkkkkkkk",
  "..kkkkKkkkkKkkk..kk.",
  "....kkkkkkkkkk...k..",
  "......kk...kk.......",
  ".......k............",
];

const KOI_C: Grid = [
  "..........k.........",
  ".........kkk........",
  "....kkkkkkkkkk...k..",
  "..kkkkKKkkkKkkk..kk.",
  ".okkkkKKkkkKKkkkkkkk",
  "..kkkkKkkkkKkkk.kkk.",
  "....kkkkkkkkkkkkkkk.",
  "......kk...kk.......",
  "........k...........",
];

export const KOI_FRAMES: readonly Grid[] = [KOI_A, KOI_B, KOI_C];
export const KOI_FRAMES_RIGHT: readonly Grid[] = KOI_FRAMES.map(flipX);

/**
 * The coin, as an object in the garden. 16 x 16.
 *
 * The glyph the hero image carries, at the resolution the garden is drawn in: a ring,
 * a lit half, the meridian down the middle, and the wireframe hemisphere behind it.
 * The brand's actual logotype stays vector — a mark has to be right at sixteen pixels
 * and at two hundred, and only one of those is a whole number of cells.
 */
export const COIN_SPRITE: Grid = [
  ".....rrrrrr.....",
  "...rrggggmmrr...",
  "..rggggggmmwwr..",
  ".rgggggggmmwwwr.",
  ".rgggggggmmw.wr.",
  "rggggggggmmwwwwr",
  "rggggggggmmw..wr",
  "rggggggggmmwwwwr",
  "rggggggggmmw..wr",
  "rggggggggmmwwwwr",
  "rggggggggmmw..wr",
  ".rgggggggmmwwwr.",
  ".rgggggggmmw.wr.",
  "..rggggggmmwwr..",
  "...rrggggmmrr...",
  ".....rrrrrr.....",
];
