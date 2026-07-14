// TopGarage Bucks — winner-take-all money ledger.
//
// Every player antes a flat entry fee into each finalized event; whoever wins
// the event (lowest finish_rank) takes the whole pot. A tie for 1st splits the
// pot evenly among the co-winners. This module turns the event_finishes data
// into (a) a per-player running balance and (b) a netted "who owes who" map,
// with every line item exposed so the UI can show all the math on hover.

export const TOPGARAGE_ENTRY_FEE = 25; // dollars, per player, per event

export type MoneyFinish = {
  entrant_id: string;
  finish_rank: number; // numeric; ties share the same rank (e.g. two 1.00s)
};

export type MoneyEvent = {
  event_id: string;
  name: string;
  slug: string;
  entry_fee?: number | null; // optional per-event override of the default fee
  finishes: MoneyFinish[];
};

// One player's line for a single event.
export type MoneyEventLine = {
  event_id: string;
  event_name: string;
  event_slug: string;
  fee: number;
  participants: number;
  pot: number;
  won: boolean;
  co_winners: number;         // how many players tied for 1st
  winner_names: string[];     // display names of the winner(s)
  net: number;                // + collected, − paid
};

// Netted balance between the player and one other player.
export type MoneyPair = {
  other_id: string;
  other_name: string;
  net: number; // > 0 → other owes the player; < 0 → player owes other
};

export type MoneyLedgerRow = {
  entrant_id: string;
  display_name: string;
  balance: number;            // sum of all event nets
  paid_in: number;            // total fees anted
  collected: number;          // total pot winnings
  events_played: number;
  events_won: number;
  lines: MoneyEventLine[];    // per-event breakdown, newest handling left to caller
  pairs: MoneyPair[];         // netted who-owes-who, non-zero only, sorted
};

export type MoneyLedger = {
  entry_fee: number;
  total_pot: number;          // sum of every event's pot
  rows: MoneyLedgerRow[];
};

function feeFor(event: MoneyEvent): number {
  const f = event.entry_fee;
  return typeof f === "number" && f > 0 ? f : TOPGARAGE_ENTRY_FEE;
}

export function buildMoneyLedger(
  members: Array<{ entrant_id: string; display_name: string }>,
  events: MoneyEvent[],
): MoneyLedger {
  const nameOf = new Map(members.map((m) => [m.entrant_id, m.display_name]));

  // Per-player accumulators.
  const balance = new Map<string, number>();
  const paidIn = new Map<string, number>();
  const collected = new Map<string, number>();
  const played = new Map<string, number>();
  const won = new Map<string, number>();
  const lines = new Map<string, MoneyEventLine[]>();
  // owed[a][b] = dollars a owes b (accumulated across events).
  const owed = new Map<string, Map<string, number>>();

  const bump = (m: Map<string, number>, k: string, v: number) =>
    m.set(k, (m.get(k) ?? 0) + v);
  const addOwed = (from: string, to: string, amt: number) => {
    if (from === to || amt === 0) return;
    const inner = owed.get(from) ?? new Map<string, number>();
    inner.set(to, (inner.get(to) ?? 0) + amt);
    owed.set(from, inner);
  };

  let totalPot = 0;

  for (const event of events) {
    const finishes = event.finishes.filter((f) => Number.isFinite(f.finish_rank));
    if (finishes.length === 0) continue;

    const fee = feeFor(event);
    const participants = finishes.length;
    const pot = participants * fee;
    totalPot += pot;

    const minRank = Math.min(...finishes.map((f) => f.finish_rank));
    const winners = finishes.filter((f) => f.finish_rank === minRank);
    const losers = finishes.filter((f) => f.finish_rank !== minRank);
    const winnerShare = pot / winners.length;
    const winnerIds = new Set(winners.map((w) => w.entrant_id));
    const winnerNames = winners.map((w) => nameOf.get(w.entrant_id) ?? "—");

    // Winner-side accounting.
    for (const w of winners) {
      const net = winnerShare - fee; // collected the pot share, paid own fee
      bump(balance, w.entrant_id, net);
      bump(paidIn, w.entrant_id, fee);
      bump(collected, w.entrant_id, winnerShare);
      bump(played, w.entrant_id, 1);
      bump(won, w.entrant_id, 1);
      const arr = lines.get(w.entrant_id) ?? [];
      arr.push({
        event_id: event.event_id,
        event_name: event.name,
        event_slug: event.slug,
        fee,
        participants,
        pot,
        won: true,
        co_winners: winners.length,
        winner_names: winnerNames,
        net,
      });
      lines.set(w.entrant_id, arr);
    }

    // Loser-side accounting: each loser's fee flows to the winner(s), split
    // evenly if there's a tie for 1st.
    for (const l of losers) {
      bump(balance, l.entrant_id, -fee);
      bump(paidIn, l.entrant_id, fee);
      bump(played, l.entrant_id, 1);
      const arr = lines.get(l.entrant_id) ?? [];
      arr.push({
        event_id: event.event_id,
        event_name: event.name,
        event_slug: event.slug,
        fee,
        participants,
        pot,
        won: false,
        co_winners: winners.length,
        winner_names: winnerNames,
        net: -fee,
      });
      lines.set(l.entrant_id, arr);

      const perWinner = fee / winners.length;
      for (const w of winnerIds) addOwed(l.entrant_id, w, perWinner);
    }
  }

  // Net the owed matrix into per-player pair lists.
  const pairsFor = (id: string): MoneyPair[] => {
    const others = new Set<string>();
    for (const [to, amt] of owed.get(id) ?? []) if (amt !== 0) others.add(to);
    for (const [from, inner] of owed) if (inner.has(id)) others.add(from);
    const out: MoneyPair[] = [];
    for (const other of others) {
      const iOwe = owed.get(id)?.get(other) ?? 0;
      const theyOwe = owed.get(other)?.get(id) ?? 0;
      const net = theyOwe - iOwe; // + → they owe me
      if (Math.abs(net) < 0.005) continue;
      out.push({ other_id: other, other_name: nameOf.get(other) ?? "—", net });
    }
    return out.sort((a, b) => b.net - a.net);
  };

  const rows: MoneyLedgerRow[] = members.map((m) => ({
    entrant_id: m.entrant_id,
    display_name: m.display_name,
    balance: balance.get(m.entrant_id) ?? 0,
    paid_in: paidIn.get(m.entrant_id) ?? 0,
    collected: collected.get(m.entrant_id) ?? 0,
    events_played: played.get(m.entrant_id) ?? 0,
    events_won: won.get(m.entrant_id) ?? 0,
    lines: lines.get(m.entrant_id) ?? [],
    pairs: pairsFor(m.entrant_id),
  }));

  return { entry_fee: TOPGARAGE_ENTRY_FEE, total_pot: totalPot, rows };
}
