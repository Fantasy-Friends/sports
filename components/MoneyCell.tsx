"use client";

import { useState } from "react";
import type { MoneyLedgerRow } from "@/lib/events/money";

const UP = "#22c55e"; // money you're owed / net positive

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

// A season-standings cell showing a player's net TopGarage Bucks. Hover
// (desktop) / tap (mobile) opens a popover with all the math: running
// paid-vs-outstanding totals, the who-still-owes-who settlement, and — on your
// OWN row — check-off toggles to mark each debtor who has paid you.
export default function MoneyCell({
  row, isMe, year, onChanged,
}: {
  row: MoneyLedgerRow;
  isMe: boolean;
  year: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const bal = row.balance;
  const balStyle = bal > 0 ? { color: UP } : undefined;
  const balClass = bal < 0 ? "text-danger" : bal === 0 ? "text-muted" : "";

  async function toggle(eventId: string, payerId: string, nextPaid: boolean) {
    const key = `${eventId}|${payerId}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/season/${year}/money/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, payer_entrant_id: payerId, paid: nextPaid }),
      });
      if (res.ok) onChanged();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={balStyle}
        className={`tabular-nums font-semibold ${balClass} underline decoration-dotted decoration-muted/50 underline-offset-4`}
        aria-expanded={open}
        aria-label={`TopGarage Bucks for ${row.display_name}: ${money(bal)}. Tap for the breakdown.`}
      >
        {bal > 0 ? "+" : ""}{money(bal)}
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[88vw] rounded-2xl border border-border/40 bg-surface/95 p-4 text-left shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted">TopGarage Bucks</span>
            <span style={balStyle} className={`text-lg font-bold tabular-nums ${balClass}`}>
              {bal > 0 ? "+" : ""}{money(bal)}
            </span>
          </div>
          <div className="mt-0.5 text-sm font-semibold text-text">
            {row.display_name}{isMe ? " (you)" : ""}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {row.events_played} event{row.events_played === 1 ? "" : "s"} · {row.events_won} won
          </div>

          {/* Running payoff totals */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/30 bg-surface/50 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted">Owed to {isMe ? "you" : "them"}</div>
              <div className="mt-0.5 text-sm">
                <span style={{ color: UP }} className="font-semibold tabular-nums">{money(row.collected)}</span>
                <span className="text-muted"> paid</span>
              </div>
              <div className="text-[11px] text-muted tabular-nums">{money(row.incoming_outstanding)} outstanding</div>
            </div>
            <div className="rounded-xl border border-border/30 bg-surface/50 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted">{isMe ? "You" : "They"} owe</div>
              <div className="mt-0.5 text-sm">
                <span className="font-semibold tabular-nums text-text">{money(row.paid_out)}</span>
                <span className="text-muted"> paid</span>
              </div>
              <div className="text-[11px] tabular-nums text-danger">{money(row.outgoing_outstanding)} outstanding</div>
            </div>
          </div>

          {/* Who still owes who (outstanding net) */}
          <div className="mt-3 border-t border-border/20 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">Who still owes who</div>
            {row.pairs.length === 0 ? (
              <div className="mt-1 text-xs text-muted">All square.</div>
            ) : (
              <ul className="mt-1 space-y-0.5 text-xs">
                {row.pairs.map((p) => (
                  <li key={p.other_id} className="flex items-center justify-between gap-2">
                    <span className="text-text">
                      {p.net > 0
                        ? <><span className="font-semibold">{p.other_name}</span> owes {isMe ? "you" : "them"}</>
                        : <>{isMe ? "you" : "they"} owe <span className="font-semibold">{p.other_name}</span></>}
                    </span>
                    <span
                      style={p.net > 0 ? { color: UP } : undefined}
                      className={`tabular-nums font-semibold ${p.net > 0 ? "" : "text-danger"}`}
                    >
                      {money(Math.abs(p.net))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Check-off: collect edges (only actionable on your own row) */}
          {row.collect_edges.length > 0 && (
            <div className="mt-3 border-t border-border/20 pt-2">
              <div className="text-[10px] uppercase tracking-wider text-muted">
                {isMe ? "Mark who paid you" : "Owed to them"}
              </div>
              <ul className="mt-1 space-y-1 text-xs">
                {row.collect_edges.map((e) => {
                  const key = `${e.event_id}|${e.payer_id}`;
                  const busy = busyKey === key;
                  return (
                    <li key={key} className="flex items-center justify-between gap-2">
                      <label className={`flex min-w-0 flex-1 items-center gap-2 ${isMe ? "cursor-pointer" : ""}`}>
                        <input
                          type="checkbox"
                          checked={e.paid}
                          disabled={!isMe || busy}
                          onChange={() => void toggle(e.event_id, e.payer_id, !e.paid)}
                          className="h-4 w-4 shrink-0 accent-[#22c55e]"
                        />
                        <span className="min-w-0 truncate">
                          <span className={`font-semibold ${e.paid ? "text-muted line-through" : "text-text"}`}>
                            {e.payer_name}
                          </span>
                          <span className="text-[11px] text-muted"> · {e.event_name}</span>
                        </span>
                      </label>
                      <span
                        style={e.paid ? undefined : { color: UP }}
                        className={`tabular-nums font-semibold ${e.paid ? "text-muted line-through" : ""}`}
                      >
                        {money(e.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* What you owe others (read-only status) */}
          {row.owe_edges.length > 0 && (
            <div className="mt-3 border-t border-border/20 pt-2">
              <div className="text-[10px] uppercase tracking-wider text-muted">
                {isMe ? "What you owe" : "They owe"}
              </div>
              <ul className="mt-1 space-y-1 text-xs">
                {row.owe_edges.map((e) => (
                  <li key={`${e.event_id}|${e.payee_id}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className={`font-semibold ${e.paid ? "text-muted line-through" : "text-text"}`}>
                        {e.payee_name}
                      </span>
                      <span className="text-[11px] text-muted"> · {e.event_name}</span>
                    </span>
                    <span className={`tabular-nums font-semibold ${e.paid ? "text-muted line-through" : "text-danger"}`}>
                      {e.paid ? "paid" : money(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
