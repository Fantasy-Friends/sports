// TopGarage Bucks — winner-take-all money ledger with settlement tracking.
//
// Every player antes a flat entry fee into each finalized event; whoever wins
// (lowest finish_rank) takes the whole pot. A tie for 1st splits the pot, and
// each loser's ante splits evenly among the co-winners. That produces a set of
// debt "edges" (loser → winner, $amount). The event winner can mark each edge
// paid; this module rolls the edges + settlements into per-player balances,
// running paid-vs-outstanding totals, and a netted "who still owes who" map.

export const TOPGARAGE_ENTRY_FEE = 25; // dollars, per player, per event

export type MoneyFinish = {
  entrant_id: string;
  finish_rank: number; // ties share the same rank (e.g. two 1.00s)
};

export type MoneyEvent = {
  event_id: string;
  name: string;
  slug: string;
  entry_fee?: number | null; // optional per-event override
  finishes: MoneyFinish[];
};

// A single debt edge for one event: payer owes payee `amount`.
export type MoneyEdge = {
  event_id: string;
  event_name: string;
  event_slug: string;
  payer_id: string;
  payer_name: string;
  payee_id: string;
  payee_name: string;
  amount: number;
  paid: boolean;
};

export type MoneyPair = {
  other_id: string;
  other_name: string;
  net: number; // > 0 → other still owes you; < 0 → you still owe other (OUTSTANDING only)
};

export type MoneyLedgerRow = {
  entrant_id: string;
  display_name: string;
  balance: number;            // net position across all events (paid or not)
  events_played: number;
  events_won: number;

  // Running settlement totals.
  collected: number;          // paid to you (settled incoming edges)
  incoming_outstanding: number; // still owed TO you
  paid_out: number;           // you've paid (settled outgoing edges)
  outgoing_outstanding: number; // you still owe

  collect_edges: MoneyEdge[]; // edges where you are the payee (check-off UI)
  owe_edges: MoneyEdge[];     // edges where you are the payer (read-only status)
  pairs: MoneyPair[];         // netted OUTSTANDING who-owes-who
};

export type MoneyLedger = {
  entry_fee: number;
  total_pot: number;
  total_outstanding: number;  // sum of all unpaid edges
  total_settled: number;      // sum of all paid edges
  rows: MoneyLedgerRow[];
};

function feeFor(event: MoneyEvent): number {
  const f = event.entry_fee;
  return typeof f === "number" && f > 0 ? f : TOPGARAGE_ENTRY_FEE;
}

export function edgeKey(eventId: string, payerId: string, payeeId: string): string {
  return `${eventId}|${payerId}|${payeeId}`;
}

export function buildMoneyLedger(
  members: Array<{ entrant_id: string; display_name: string }>,
  events: MoneyEvent[],
  settledEdgeKeys: Set<string> = new Set(),
): MoneyLedger {
  const nameOf = new Map(members.map((m) => [m.entrant_id, m.display_name]));
  const name = (id: string) => nameOf.get(id) ?? "—";

  const balance = new Map<string, number>();
  const played = new Map<string, number>();
  const won = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  const edges: MoneyEdge[] = [];
  let totalPot = 0;

  for (const event of events) {
    const finishes = event.finishes.filter((f) => Number.isFinite(f.finish_rank));
    if (finishes.length === 0) continue;

    const fee = feeFor(event);
    const pot = finishes.length * fee;
    totalPot += pot;

    const minRank = Math.min(...finishes.map((f) => f.finish_rank));
    const winners = finishes.filter((f) => f.finish_rank === minRank);
    const losers = finishes.filter((f) => f.finish_rank !== minRank);
    const winnerShare = pot / winners.length;
    const perWinnerFromLoser = fee / winners.length;

    for (const w of winners) {
      bump(balance, w.entrant_id, winnerShare - fee);
      bump(played, w.entrant_id, 1);
      bump(won, w.entrant_id, 1);
    }
    for (const l of losers) {
      bump(balance, l.entrant_id, -fee);
      bump(played, l.entrant_id, 1);
      for (const w of winners) {
        edges.push({
          event_id: event.event_id,
          event_name: event.name,
          event_slug: event.slug,
          payer_id: l.entrant_id,
          payer_name: name(l.entrant_id),
          payee_id: w.entrant_id,
          payee_name: name(w.entrant_id),
          amount: perWinnerFromLoser,
          paid: settledEdgeKeys.has(edgeKey(event.event_id, l.entrant_id, w.entrant_id)),
        });
      }
    }
  }

  let totalOutstanding = 0;
  let totalSettled = 0;
  for (const e of edges) {
    if (e.paid) totalSettled += e.amount;
    else totalOutstanding += e.amount;
  }

  const rows: MoneyLedgerRow[] = members.map((m) => {
    const id = m.entrant_id;
    const collect = edges.filter((e) => e.payee_id === id);
    const owe = edges.filter((e) => e.payer_id === id);

    const collected = collect.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
    const incomingOutstanding = collect.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);
    const paidOut = owe.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
    const outgoingOutstanding = owe.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);

    // Netted OUTSTANDING pairwise: only unpaid edges count.
    const otherNet = new Map<string, number>();
    for (const e of collect) if (!e.paid) otherNet.set(e.payer_id, (otherNet.get(e.payer_id) ?? 0) + e.amount);
    for (const e of owe) if (!e.paid) otherNet.set(e.payee_id, (otherNet.get(e.payee_id) ?? 0) - e.amount);
    const pairs: MoneyPair[] = [...otherNet.entries()]
      .filter(([, net]) => Math.abs(net) >= 0.005)
      .map(([other_id, net]) => ({ other_id, other_name: name(other_id), net }))
      .sort((a, b) => b.net - a.net);

    // Sort edges newest-relevant: outstanding first, then by event name.
    const edgeSort = (a: MoneyEdge, b: MoneyEdge) =>
      Number(a.paid) - Number(b.paid) || a.event_name.localeCompare(b.event_name) || a.payer_name.localeCompare(b.payer_name);

    return {
      entrant_id: id,
      display_name: m.display_name,
      balance: balance.get(id) ?? 0,
      events_played: played.get(id) ?? 0,
      events_won: won.get(id) ?? 0,
      collected,
      incoming_outstanding: incomingOutstanding,
      paid_out: paidOut,
      outgoing_outstanding: outgoingOutstanding,
      collect_edges: [...collect].sort(edgeSort),
      owe_edges: [...owe].sort(edgeSort),
      pairs,
    };
  });

  return {
    entry_fee: TOPGARAGE_ENTRY_FEE,
    total_pot: totalPot,
    total_outstanding: totalOutstanding,
    total_settled: totalSettled,
    rows,
  };
}
