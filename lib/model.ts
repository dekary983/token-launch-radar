// Launch Radar's model: one sealed snapshot in, one ranked board out.
//
// The board covers every slug on the snapshot's watchlist (the floor, never a ceiling) and adds every
// other rankable pre-token protocol the snapshot carries, so the radar also finds the early ones below
// the floor. A protocol is pre-token when its record carries no token: no market cap, no CoinGecko id,
// no symbol. Protocols whose token already trades are never ranked; the dashboard sets them aside as
// the peer set, because their market caps are the evidence the model is built from.
//
// Implied value is a peer multiple, not a flat one. Tokenized protocols in the same DefiLlama category
// trade at some market-cap-to-TVL ratio; the model takes each category's median ratio, shrinks it
// toward the global median when the category has few peers, and applies it to the pre-token protocol's
// TVL. A peer counts only when it carries at least $25M of TVL itself, half the watchlist floor: a
// $7M protocol's 400x multiple is a fact about that protocol, not evidence about a giant's launch.
// Three adjustments from the protocol's own record then move the base:
//
//   implied = tvl x peerRatio(category) x growthMult x maturityMult x reachMult
//
//   growthMult    1 + clamp(change_7d, -50, 100) / 100 x 0.6   (a hot week is worth up to +60%)
//   maturityMult  0.7 + 0.6 x min(age_days, 1825) / 1825       (five tokenless years earn the full 1.3)
//   reachMult     1 + 0.03 x min(chains - 1, 7)                 (each extra chain adds distribution)
//
// No protocol name is ever special-cased: the same functions score every row, and every constant is
// stated on the dashboard the program writes.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** A peer ratio below this is not evidence; above this is not either. Both clamp the medians. */
  ratio_floor: number;
  ratio_cap: number;
  /** The least TVL a tokenized protocol must carry before its multiple counts as peer evidence. */
  peer_min_tvl: number;
  /** Each peer's own ratio is clamped to this band before any median is taken. */
  peer_clamp_lo: number;
  peer_clamp_hi: number;
  /** How many phantom global-median peers shrink a thin category toward the global median. */
  shrink_peers: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_max_extra: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.03,
  ratio_cap: 2.5,
  peer_min_tvl: 25_000_000,
  peer_clamp_lo: 0.01,
  peer_clamp_hi: 5,
  shrink_peers: 6,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.6,
  maturity_days: 1825,
  unknown_age_days: 365,
  reach_per_chain: 0.03,
  reach_max_extra: 7,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'launch-radar-2';

/** How many live-token protocols the dashboard's peer view carries, by market cap. */
export const LIVE_ROWS = 36;

/** One category's peer evidence: how many tokenized peers, and the ratios the model derived. */
export interface CategoryStat {
  category: string;
  peers: number;
  median_ratio: number;
  applied_ratio: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with the model's working shown. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_ratio: number;
    peer_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: everything the page renders, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  peer_ratio: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the page shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the peer set, the category evidence and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_ratio: number;
  peer_total: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  categories: CategoryStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list, the middle value of the sorted copy. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying a whole word that marks a wrapped or staked product of another asset. */
const DERIVATIVE_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories that are products of another protocol's asset, never a launch of their own. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Names that begin with an exchange's name are that exchange's product, not a protocol. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is one the board may rank. The line is the watchlist's own definition of "not a
 * wrapped, staked or bridged product of a protocol whose token already trades", applied at every TVL:
 * pre-token, in no derivative category, not a versioned pool, not a wrapped or staked product by name,
 * and not an exchange's product by name. WBTC records no token of its own in the snapshot's fields,
 * but it is Bitcoin on Ethereum: it fails this line on its Bridge category, as it should.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !DERIVATIVE_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !DERIVATIVE_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The peer evidence: per-category median market-cap-to-TVL ratios of the tokenized protocols. */
export interface PeerEvidence {
  globalRatio: number;
  peerTotal: number;
  byCategory: Map<string, { peers: number; medianRatio: number }>;
}

/**
 * Read the tokenized protocols as comparables. A peer needs a market cap and at least the model's
 * minimum TVL to have a ratio that counts; each ratio is clamped to the model's band before any
 * median is taken, so one mispriced microcap cannot drag a whole category with it.
 */
export function peerEvidence(snapshot: Snapshot, model: ModelConstants = MODEL): PeerEvidence {
  const ratios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd < model.peer_min_tvl) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, model.peer_clamp_lo, model.peer_clamp_hi);
    ratios.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const medians = new Map<string, { peers: number; medianRatio: number }>();
  for (const [key, list] of byCategory) medians.set(key, { peers: list.length, medianRatio: median(list) });
  return { globalRatio: ratios.length > 0 ? median(ratios) : 0.25, peerTotal: ratios.length, byCategory: medians };
}

/** The ratio one protocol is valued at: its category's median, shrunk toward the global by thinness. */
export function appliedRatio(evidence: PeerEvidence, category: string | null, model: ModelConstants = MODEL): { ratio: number; peers: number; categoryMedian: number } {
  const stat = evidence.byCategory.get(category ?? 'Uncategorized');
  if (stat === undefined) return { ratio: clamp(evidence.globalRatio, model.ratio_floor, model.ratio_cap), peers: 0, categoryMedian: evidence.globalRatio };
  const shrunk = (stat.peers * stat.medianRatio + model.shrink_peers * evidence.globalRatio) / (stat.peers + model.shrink_peers);
  return { ratio: clamp(shrunk, model.ratio_floor, model.ratio_cap), peers: stat.peers, categoryMedian: stat.medianRatio };
}

/** The multipliers and the implied value one protocol gets under `model` and the peer `evidence`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  evidence: PeerEvidence,
  model: ModelConstants = MODEL,
): { implied: number; peerRatio: number; peerCount: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { ratio, peers } = appliedRatio(evidence, protocol.category, model);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + model.reach_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * ratio * growthMult * maturityMult * reachMult));
  return { implied, peerRatio: ratio, peerCount: peers, growthPct, growthMult, maturityMult, reachMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const onWatchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is a row, whatever the radar's own line would say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL the snapshot carries. The
  // board ranks them all by implied value; a small protocol with a rich category multiple can still
  // outrank a large one, which is the finding a TVL table cannot make.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const evidence = peerEvidence(snapshot, model);
  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, evidence, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: onWatchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      peer_ratio: round4(s.v.peerRatio),
      peer_count: s.v.peerCount,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      reach_multiplier: round4(s.v.reachMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one on-chain action costs in gas on a chain, by the chain's fee class. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $8 of ETH in gas';
  if (c === 'solana') return 'under $0.10 of SOL in fees';
  if (c === 'bitcoin' || c === 'btc') return 'about $2 of BTC in fees';
  if (c.includes('bsc') || c.includes('bnb')) return 'about $0.40 of BNB in gas';
  if (['arbitrum', 'base', 'optimism', 'zksync era', 'linea', 'scroll', 'mantle', 'blast', 'mode', 'polygon zkevm', 'opbnb'].includes(c)) return 'about $0.30 of gas on the rollup';
  return 'about $1 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('uncollateralized')) return `Lend $${capital} of USDC into one of ${name}'s pools on ${chain}, choosing the pool with the shortest lock-up first.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC as collateral to ${name} on ${chain}, then borrow about 30% against it so both sides of the market see your wallet.`;
  if (c.includes('dex') || c.includes('swap')) return `Provide $${capital} of liquidity to ${name}'s busiest stablecoin pool on ${chain}, then make one swap a week through its own interface.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then use the bridged funds in one app on the far side the same day.`;
  if (c.includes('restak')) return `Restake $${capital} of liquid staking tokens through ${name} on ${chain} and hold the receipt token in the same wallet.`;
  if (c.includes('staking') || c.includes('staking pool')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the liquid receipt in the wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and trade one small hedged position a week, sized so fees stay under $5.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and hold one position in its most liquid market until it settles.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('manager')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares untouched in the wallet.`;
  if (c.includes('stable')) return `Mint $${capital} of ${name}'s stable asset on ${chain} against collateral, then hold the minted asset rather than swapping out of it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it past one full distribution cycle.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy to expiry.`;
  if (c.includes('basis')) return `Open a $${capital} delta-neutral basis position through ${name} on ${chain}: long the spot leg, short the funding leg.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} into ${name}'s main vault on ${chain} and leave auto-compounding on.`;
  if (c.includes('privacy')) return `Route one $${capital} transfer through ${name} on ${chain} using its standard pool, and keep the withdrawal note.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC onto ${name} and make one transaction a week with a native app there.`;
  if (c.includes('payments') || c.includes('card')) return `Fund $${capital} on ${name} and make two real payments from the balance in the first month.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open and untouched.`;
}

/** The category's second qualifying action: what to repeat so the activity reads as use, not a visit. */
function repeatFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Repay a slice of the borrow and borrow again once a week, so the wallet shows a live credit history rather than one deposit.';
  if (c.includes('dex') || c.includes('swap')) return 'Add a small amount to the pool or rebalance it once a week, and route one ordinary swap through the interface each time.';
  if (c.includes('bridge')) return 'Bridge a small amount back on a different day each week, varying the asset and the amount so the crossings read as use.';
  if (c.includes('staking') || c.includes('restak')) return 'Claim any staking rewards weekly and restake them from the same wallet, so the balance history compounds visibly.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Roll the hedge once a week and keep total fees under $5 a week; volume chased past that costs more than it can earn.';
  return 'Repeat the core action in a smaller size once a week, on a different day each time, so the wallet builds a dated history of real use.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age, seven-day momentum), never from a list of
 * names, so the same plan the board carries is the plan the dashboard shows.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const falling = p.change_7d !== null && p.change_7d <= -15;
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it from an exchange withdrawal rather than from your main wallet, and keep its seed phrase offline.`,
      cost: 'no fee beyond the withdrawal, under $2 on most chains',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: repeatFor(p),
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days without withdrawing, so the activity spans more than one weekly snapshot of the protocol's books.`,
      cost: `the $${capital} stays in the position for the whole window`,
      time: `${hold} days`,
    },
  ];
  if (falling) {
    steps.push({
      text: `${p.name}'s TVL fell ${Math.abs(p.change_7d!).toFixed(1)}% in the last seven days: halve the position size, check the protocol's own status page before adding more, and be ready to exit if outflows continue another week.`,
      cost: 'nothing to check; a smaller position is the saving',
      time: '10 minutes a week while TVL falls',
    });
  } else {
    steps.push({
      text: `Open ${p.name}'s own points, rewards or governance page once a week and confirm your wallet's activity is being counted; if a points program opens, register the same wallet before doing anything new.`,
      cost: 'no fee to check, and never pay anyone to claim or register for you',
      time: '10 minutes a week',
    });
  }
  steps.push({
    text: `Keep a farm log with the wallet, the dates and every transaction hash, and unwind the position the week a token claim is announced, claiming only from the link on the protocol's own page.`,
    cost: 'nothing but the log; claiming from a search result or a direct message is how wallets get drained',
    time: '5 minutes a week, 20 minutes to unwind',
  });
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's peer view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** The category evidence table the dashboard shows: the model's comparables, strongest first. */
export function categoryStats(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryStat[] {
  const evidence = peerEvidence(snapshot, model);
  const stats: CategoryStat[] = [];
  for (const [category, stat] of evidence.byCategory) {
    const { ratio } = appliedRatio(evidence, category, model);
    stats.push({ category, peers: stat.peers, median_ratio: round4(stat.medianRatio), applied_ratio: round4(ratio) });
  }
  return stats.sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
}

/** A board row's form for data.js: everything the page renders, the farm plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    peer_ratio: row.model.peer_ratio,
    peer_count: row.model.peer_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const evidence = peerEvidence(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_ratio: round4(evidence.globalRatio),
    peer_total: evidence.peerTotal,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    categories: categoryStats(snapshot, model),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${r.slug} has a farm step of ${trimmed.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
