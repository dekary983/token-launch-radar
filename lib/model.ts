// Token Launch Radar — model library.
// One sealed snapshot in, one ranked board out: every pre-token protocol the snapshot
// carries, valued with the peer-multiple model stated in MODEL below.
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  ratio_floor: number;
  ratio_cap: number;
  peer_min_tvl: number;
  peer_clamp_lo: number;
  peer_clamp_hi: number;
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

export interface CategoryStat {
  category: string;
  peers: number;
  median_ratio: number;
  applied_ratio: number;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface PeerCategory {
  peers: number;
  medianRatio: number;
}

export interface PeerEvidence {
  globalRatio: number;
  peerTotal: number;
  byCategory: Map<string, PeerCategory>;
}

export interface BoardModel {
  peer_ratio: number;
  peer_count: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  age_days: number | null;
}

export interface BoardRow extends SnapshotProtocol {
  rank: number;
  token_status: string;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: BoardModel;
  farm_steps: string[];
}

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

export const MODEL: ModelConstants = {
  ratio_floor: 0.03,
  ratio_cap: 2.5,
  peer_min_tvl: 25000000,
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

export const MODEL_VERSION = 'launch-radar-2';
export const LIVE_ROWS = 36;
const DAY_MS = 86400000;

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const excludedCategories = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p)
    && !excludedCategories.has(p.category ?? '')
    && !/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)
    && !/\b(wrapped|staked|staking)\b/i.test(p.name)
    && !/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/.test(p.name);
}

export function peerEvidence(snapshot: Snapshot, model: ModelConstants = MODEL): PeerEvidence {
  const all: number[] = [];
  const categories = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd < model.peer_min_tvl) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, model.peer_clamp_lo, model.peer_clamp_hi);
    all.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const ratios = categories.get(key) ?? [];
    ratios.push(ratio);
    categories.set(key, ratios);
  }
  const byCategory = new Map<string, PeerCategory>();
  for (const [category, ratios] of categories) byCategory.set(category, { peers: ratios.length, medianRatio: median(ratios) });
  return { globalRatio: all.length ? median(all) : 0.25, peerTotal: all.length, byCategory };
}

export function appliedRatio(evidence: PeerEvidence, category: string | null, model: ModelConstants = MODEL): { ratio: number; peers: number; categoryMedian: number } {
  const stat = evidence.byCategory.get(category ?? 'Uncategorized');
  if (!stat) return { ratio: clamp(evidence.globalRatio, model.ratio_floor, model.ratio_cap), peers: 0, categoryMedian: evidence.globalRatio };
  const shrunk = (stat.peers * stat.medianRatio + model.shrink_peers * evidence.globalRatio) / (stat.peers + model.shrink_peers);
  return { ratio: clamp(shrunk, model.ratio_floor, model.ratio_cap), peers: stat.peers, categoryMedian: stat.medianRatio };
}

export interface ImpliedValue {
  implied: number;
  peerRatio: number;
  peerCount: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  reachMult: number;
  age: number | null;
}

export function impliedValue(protocol: SnapshotProtocol, asOf: string, evidence: PeerEvidence, model: ModelConstants = MODEL): ImpliedValue {
  const peer = appliedRatio(evidence, protocol.category, model);
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = model.maturity_floor + (clamp(age ?? model.unknown_age_days, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + model.reach_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * peer.ratio * growthMult * maturityMult * reachMult));
  return { implied, peerRatio: peer.ratio, peerCount: peer.peers, growthPct, growthMult, maturityMult, reachMult, age };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains[0] ?? 'its main chain';
}

function gasFor(chain: string): string {
  const lower = chain.toLowerCase();
  if (lower === 'ethereum') return 'about $8 of ETH in gas';
  if (lower === 'solana') return 'under $0.10 of SOL in fees';
  if (lower === 'bitcoin' || lower === 'btc') return 'about $2 of BTC in fees';
  if (lower.includes('bsc') || lower.includes('bnb')) return 'about $0.40 of BNB in gas';
  if (['arbitrum', 'base', 'optimism', 'zksync era', 'linea', 'scroll', 'mantle', 'blast', 'mode', 'polygon zkevm', 'opbnb'].includes(lower)) return 'about $0.30 of gas on the rollup';
  return 'about $1 of gas';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5e9) return 500;
  if (p.tvl_usd >= 1e9) return 250;
  if (p.tvl_usd >= 2.5e8) return 150;
  if (p.tvl_usd >= 5e7) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const category = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (category.includes('uncollateralized')) return `Lend $${capital} of USDC into one of ${name}'s pools on ${chain}, choosing the pool with the shortest lock-up first.`;
  if (category.includes('lend') || category.includes('cdp') || category.includes('collateral')) return `Supply $${capital} of USDC as collateral to ${name} on ${chain}, then borrow about 30% against it so both sides of the market see your wallet.`;
  if (category.includes('dex') || category.includes('swap')) return `Provide $${capital} of liquidity to ${name}'s busiest stablecoin pool on ${chain}, then make one swap a week through its own interface.`;
  if (category.includes('bridge')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then use the bridged funds in one app on the far side the same day.`;
  if (category.includes('restak')) return `Restake $${capital} of liquid staking tokens through ${name} on ${chain} and hold the receipt token in the same wallet.`;
  if (category.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the liquid receipt in the wallet.`;
  if (category.includes('perpetual') || category.includes('derivative') || category.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and trade one small hedged position a week, sized so fees stay under $5.`;
  if (category.includes('prediction')) return `Fund $${capital} on ${name} and hold one position in its most liquid market until it settles.`;
  if (category.includes('curator') || category.includes('allocator') || category.includes('manager')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares untouched in the wallet.`;
  if (category.includes('stable')) return `Mint $${capital} of ${name}'s stable asset on ${chain} against collateral, then hold the minted asset rather than swapping out of it.`;
  if (category.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it past one full distribution cycle.`;
  if (category.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy to expiry.`;
  if (category.includes('basis')) return `Open a $${capital} delta-neutral basis position through ${name} on ${chain}: long the spot leg, short the funding leg.`;
  if (category.includes('yield') || category.includes('farm')) return `Deposit $${capital} into ${name}'s main vault on ${chain} and leave auto-compounding on.`;
  if (category.includes('privacy')) return `Route one $${capital} transfer through ${name} on ${chain} using its standard pool, and keep the withdrawal note.`;
  if (category.includes('chain')) return `Bridge $${capital} of USDC onto ${name} and make one transaction a week with a native app there.`;
  if (category.includes('payments') || category.includes('card')) return `Fund $${capital} on ${name} and make two real payments from the balance in the first month.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open and untouched.`;
}

function repeatFor(p: SnapshotProtocol): string {
  const category = (p.category ?? '').toLowerCase();
  if (category.includes('lend') || category.includes('cdp') || category.includes('collateral')) return 'Repay a slice of the borrow and borrow again once a week, so the wallet shows a live credit history rather than one deposit.';
  if (category.includes('dex') || category.includes('swap')) return 'Add a small amount to the pool or rebalance it once a week, and route one ordinary swap through the interface each time.';
  if (category.includes('bridge')) return 'Bridge a small amount back on a different day each week, varying the asset and the amount so the crossings read as use.';
  if (category.includes('staking') || category.includes('restak')) return 'Claim any staking rewards weekly and restake them from the same wallet, so the balance history compounds visibly.';
  if (category.includes('perpetual') || category.includes('derivative') || category.includes('options')) return 'Roll the hedge once a week and keep total fees under $5 a week; volume chased past that costs more than it can earn.';
  return 'Repeat the core action in a smaller size once a week, on a different day each time, so the wallet builds a dated history of real use.';
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const riskStep = p.change_7d !== null && p.change_7d <= -15
    ? {
      text: `${p.name}'s TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in the last seven days: halve the position size, check the protocol's own status page before adding more, and be ready to exit if outflows continue another week.`,
      cost: 'nothing to check; a smaller position is the saving',
      time: '10 minutes a week while TVL falls',
    }
    : {
      text: `Open ${p.name}'s own points, rewards or governance page once a week and confirm your wallet's activity is being counted; if a points program opens, register the same wallet before doing anything new.`,
      cost: 'no fee to check, and never pay anyone to claim or register for you',
      time: '10 minutes a week',
    };
  return [
    { text: `Set up a fresh wallet for ${p.name} alone, fund it from an exchange withdrawal rather than from your main wallet, and keep its seed phrase offline.`, cost: 'no fee beyond the withdrawal, under $2 on most chains', time: '10 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital plus ${gas}`, time: '15 minutes to set up' },
    { text: repeatFor(p), cost: `${gas} a week`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days without withdrawing, so the activity spans more than one weekly snapshot of the protocol's books.`, cost: `the $${capital} stays in the position for the whole window`, time: `${hold} days` },
    riskStep,
    { text: 'Keep a farm log with the wallet, the dates and every transaction hash, and unwind the position the week a token claim is announced, claiming only from the link on the protocol\'s own page.', cost: 'nothing but the log; claiming from a search result or a direct message is how wallets get drained', time: '5 minutes a week, 20 minutes to unwind' },
  ];
}

export function stepText(step: FarmStep): string {
  let result = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (result.length > 600) result = `${result.slice(0, 596)}...`;
  if (result.length < 20) result += " Hold the position and check the protocol's own page.";
  return result;
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const protocol = snapshot.protocols.find((p) => p.slug === slug);
    if (protocol) chosen.set(protocol.slug, protocol);
  }
  for (const p of snapshot.protocols) if (isRankable(p)) chosen.set(p.slug, p);
  const evidence = peerEvidence(snapshot, model);
  const entries = [...chosen.values()].map((p) => ({ p, value: impliedValue(p, snapshot.as_of, evidence, model) }));
  entries.sort((a, b) => b.value.implied - a.value.implied || a.p.slug.localeCompare(b.p.slug));
  return entries.map(({ p, value }, index) => ({
    rank: index + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    watchlist: snapshot.watchlist.includes(p.slug),
    age_days: value.age,
    implied_value_usd: value.implied,
    model: {
      peer_ratio: round4(value.peerRatio),
      peer_count: value.peerCount,
      growth_pct: value.growthPct,
      growth_multiplier: round4(value.growthMult),
      maturity_multiplier: round4(value.maturityMult),
      reach_multiplier: round4(value.reachMult),
      age_days: value.age,
    },
    farm_steps: farmSteps(p, value.age).map(stepText),
  }));
}

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

export function categoryStats(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryStat[] {
  const evidence = peerEvidence(snapshot, model);
  return [...evidence.byCategory.entries()]
    .map(([category, stat]) => ({
      category,
      peers: stat.peers,
      median_ratio: round4(stat.medianRatio),
      applied_ratio: round4(appliedRatio(evidence, category, model).ratio),
    }))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
}

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

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const evidence = peerEvidence(snapshot, model);
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
    early_size: board.filter((row) => !row.watchlist).length,
    live_size: liveRows(snapshot).length,
    categories: categoryStats(snapshot, model),
    rows: board.map(radarRow),
    live: liveRows(snapshot),
  };
  return { board, radar };
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSnapshot(text: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (!isRecord(value)) throw new SnapshotError('snapshot.json is not a JSON object');
  if (typeof value.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof value.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof value.floor_usd !== 'number' || !Number.isSafeInteger(value.floor_usd) || value.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(value.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(value.watchlist) || !value.watchlist.every((item) => typeof item === 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = value.protocols.map((entry, i): SnapshotProtocol => {
    if (!isRecord(entry)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    if (typeof entry.slug !== 'string' || typeof entry.name !== 'string' || typeof entry.tvl_usd !== 'number' || !Number.isFinite(entry.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: entry.slug,
      name: entry.name,
      category: typeof entry.category === 'string' ? entry.category : null,
      chains: Array.isArray(entry.chains) ? entry.chains.filter((chain): chain is string => typeof chain === 'string') : [],
      tvl_usd: entry.tvl_usd,
      change_7d: typeof entry.change_7d === 'number' && Number.isFinite(entry.change_7d) ? entry.change_7d : null,
      mcap_usd: typeof entry.mcap_usd === 'number' && Number.isFinite(entry.mcap_usd) ? entry.mcap_usd : null,
      listed_at: typeof entry.listed_at === 'string' ? entry.listed_at : null,
      gecko_id: typeof entry.gecko_id === 'string' ? entry.gecko_id : null,
      symbol: typeof entry.symbol === 'string' ? entry.symbol : null,
    };
  });
  return { as_of: value.as_of, source: value.source, floor_usd: value.floor_usd, protocols, watchlist: value.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const boardSlugs = new Set(board.map((row) => row.slug));
  const missing = snapshot.watchlist.filter((slug) => !boardSlugs.has(slug));
  if (missing.length) {
    const n = missing.length;
    return `the board misses ${n} watchlist slug${n === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const ranks = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${row.slug} has a farm step of ${len} characters`;
    }
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has implied value ${row.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
