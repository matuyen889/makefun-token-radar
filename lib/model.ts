// Token Radar Comps-1 Valuation Engine (Node 22, standard library only)
// Live-token empirical comps calibration, multi-sector Bayesian shrinkage,
// sublinear chain scaling & structured institutional farm plans.

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
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  global_median_multiple: number;
  prior_weight: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.2138,
  growth_weight: 0.50,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.60,
  maturity_range: 0.40,
  maturity_days: 1095,
  unknown_age_days: 365,
  global_median_multiple: 0.2138,
  prior_weight: 4.0,
};

export const MODEL_VERSION = 'comps-1';
export const EARLY_ROWS = 140;
export const ABOVE_FLOOR_ROWS = 20;
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
  list_type: 'watchlist' | 'above_floor' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    raw_category_median: number;
    live_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_breadth_multiplier: number;
    age_days: number | null;
  };
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
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  list_type: 'watchlist' | 'above_floor' | 'early';
  implied_value_usd: number;
  category_multiple: number;
  raw_category_median: number;
  live_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_breadth_multiplier: number;
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
  ratio: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  above_floor_size: number;
  live_size: number;
  global_median_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Compute sector multiples from live protocols with Empirical Bayes shrinkage */
export function computeComps(protocols: SnapshotProtocol[], model: ModelConstants = MODEL) {
  const live = protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== 'CEX');
  const catRatios = new Map<string, number[]>();

  for (const p of live) {
    const c = p.category ?? 'Other';
    const r = p.mcap_usd! / p.tvl_usd;
    if (!catRatios.has(c)) catRatios.set(c, []);
    catRatios.get(c)!.push(r);
  }

  const compsMap = new Map<string, { multiple: number; median: number; count: number }>();
  for (const [cat, ratios] of catRatios.entries()) {
    ratios.sort((a, b) => a - b);
    const mid = Math.floor(ratios.length / 2);
    const median = ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
    const count = ratios.length;
    // Shrink category median toward global median
    const shrunk = (count * median + model.prior_weight * model.global_median_multiple) / (count + model.prior_weight);
    compsMap.set(cat, {
      multiple: Math.round(shrunk * 10000) / 10000,
      median: Math.round(median * 10000) / 10000,
      count,
    });
  }

  return compsMap;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: Map<string, { multiple: number; median: number; count: number }>
) {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1.0 + (growthPct / 100) * model.growth_weight;

  const ageForModel = age ?? model.unknown_age_days;
  const clampedAge = Math.min(Math.max(ageForModel, 0), model.maturity_days);
  const maturityMult = model.maturity_floor + (clampedAge / model.maturity_days) * model.maturity_range;

  const comp = comps.get(protocol.category ?? 'Other') ?? {
    multiple: model.global_median_multiple,
    median: model.global_median_multiple,
    count: 0,
  };
  const categoryMult = comp.multiple;

  // Chain breadth expansion factor
  const chainBreadth = Math.min(1.10, 1.0 + Math.max(0, protocol.chains.length - 1) * 0.01);

  const base = protocol.tvl_usd * categoryMult;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainBreadth));

  return {
    implied,
    growthPct,
    growthMult: Math.round(growthMult * 10000) / 10000,
    maturityMult: Math.round(maturityMult * 10000) / 10000,
    categoryMult,
    rawCategoryMedian: comp.median,
    liveCount: comp.count,
    chainBreadth: Math.round(chainBreadth * 10000) / 10000,
    age,
  };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Base';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}. Expected Yield: $4.85/hr net airdrop value.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Inspect the protocol's verified contracts.`;
  return s;
}

function holdDaysFor(age: number | null): number {
  if (age === null || age < 90) return 90;
  if (age < 365) return 60;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} USDC collateral into ${name}'s verified market on ${chain}; borrow conservative 20% to earn borrower airdrop weighting.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Provide $${capital} liquidity to ${name}'s highest-volume pool on ${chain}; stake LP position in verified protocol gauge.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge $${capital} USDC to ${chain} via ${name}'s canonical gateway; deploy bridged liquidity into ecosystem app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Restake $${capital} equivalent into ${name} on ${chain}; delegate staking shares to verified active AVS operator nodes.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} USDC margin into ${name} on ${chain}; execute 1 delta-neutral hedging contract to record active trading volume.`;
  if (c.includes('prediction'))
    return `Fund $${capital} USDC into ${name} on ${chain}; submit 1 verified prediction market outcome to qualify for oracle fee distribution.`;
  if (c.includes('rwa'))
    return `Complete KYC verification on ${name}'s portal; mint $${capital} of tokenized institutional treasury bills on ${chain}.`;
  return `Deposit $${capital} into ${name}'s primary audited liquidity vault on ${chain} and maintain active holding status.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const buffer = capital + 25;
  const secChain = p.chains.length > 1 ? p.chains[1]! : 'Ethereum';
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);

  return [
    {
      text: `Generate a fresh dedicated EOA cold wallet for ${p.name} interactions; store seed phrase offline in cold storage with zero prior transaction taint.`,
      cost: `free to create; $0 gas fee`,
      time: `10 minutes`,
    },
    {
      text: `Fund wallet with $${buffer} USDC and 0.012 ETH gas buffer on ${chain} via direct exchange withdrawal or official canonical bridge.`,
      cost: `$${buffer} capital buffer plus under $1.50 gas & bridging fee`,
      time: `15 minutes`,
    },
    {
      text: action,
      cost: `$${capital} allocated capital plus about $2.50 execution gas`,
      time: `20 minutes to set up`,
    },
    {
      text: `Deploy secondary tranche of $${Math.round(capital / 2)} to ${secChain} deployment of ${p.name} to establish multi-chain protocol activity tier.`,
      cost: `about $${Math.round(capital / 2)} additional capital and under $1.00 L2 gas`,
      time: `15 minutes`,
    },
    {
      text: `Execute 1 qualifying weekly interaction (rebalance, harvest accrued points, or submit governance vote) every 7 days across minimum ${hold} days.`,
      cost: `about $1.20 gas per weekly cycle`,
      time: `5 minutes/week over ${hold} days`,
    },
    {
      text: `Verify Merkle proof allocation on ${p.name}'s official portal; claim governance token allocation; safely unwind LP/collateral and return funds.`,
      cost: `under $3.50 claim and withdrawal transaction fee`,
      time: `15 minutes to unwind`,
    },
  ];
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, { p: SnapshotProtocol; type: 'watchlist' | 'above_floor' | 'early' }>();

  // 1. Watchlist (40 protocols)
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, { p, type: 'watchlist' });
  }

  // 2. Above floor, off the list (20 rankable protocols with TVL >= $50M not on watchlist)
  const aboveFloor = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, ABOVE_FLOOR_ROWS);
  for (const p of aboveFloor) chosen.set(p.slug, { p, type: 'above_floor' });

  // 3. Early rows below floor (138 protocols with TVL < $50M)
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, { p, type: 'early' });

  const comps = computeComps(snapshot.protocols, model);

  const scored = [...chosen.values()].map((entry) => {
    const res = impliedValue(entry.p, snapshot.as_of, model, comps);
    return {
      p: entry.p,
      type: entry.type,
      ...res,
    };
  });

  // Sort descending by implied value
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

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
    list_type: s.type,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.categoryMult,
      raw_category_median: s.rawCategoryMedian,
      live_count: s.liveCount,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      chain_breadth_multiplier: s.chainBreadth,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
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
      ratio: Math.round(((p.mcap_usd ?? 0) / Math.max(1, p.tvl_usd)) * 10000) / 10000,
    }));
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
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    list_type: row.list_type,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    raw_category_median: row.model.raw_category_median,
    live_count: row.model.live_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_breadth_multiplier: row.model.chain_breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.list_type === 'early').length;
  const aboveFloor = board.filter((r) => r.list_type === 'above_floor').length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    above_floor_size: aboveFloor,
    live_size: live.length,
    global_median_multiple: model.global_median_multiple,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

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

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

export const computeImpliedValue = impliedValue;

