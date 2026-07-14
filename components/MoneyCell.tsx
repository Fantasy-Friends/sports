"use client";

import { useState } from "react";
import type { MoneyLedgerRow } from "@/lib/events/money";

const UP = "#22c55e"; // money you're owed / net positive

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

// A season-standings cell that shows a player's net TopGarage Bucks with a
// hover (desktop) / tap (mobile) popover breaking down every dollar: the
// who-owes-who settlement and the per-event pot math.
export default function MoneyCell({
  row, isMe,
}: {
  row: MoneyLedgerRow;
  isMe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const bal = row.balance;
  const balStyle = bal > 0 ? { color: UP } : undefined;
  const balClass = bal < 0 ? "text-danger" : bal === 0 ? "text-muted" : "";

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
          className="absolute right-0 z-30 mt-2 w-72 max-w-[85vw] rounded-2xl border border-border/40 bg-surface/95 p-4 text-left shadow-2xl backdrop-blur-xl"
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
            {row.events_played} event{row.events_played === 1 ? "" : "s"} · {row.events_won} won ·
            anted {money(row.paid_in)} · collected {money(row.collected)}
          </div>

          {/* Who owes who */}
          <div className="mt-3 border-t border-border/20 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">Who owes who</div>
            {row.pairs.length === 0 ? (
              <div className="mt-1 text-xs text-muted">All square — nobody owes anybody.</div>
            ) : (
              <ul className="mt-1 space-y-0.5 text-xs">
                {row.pairs.map((p) => (
                  <li key={p.other_id} className="flex items-center justify-between gap-2">
                    <span className="text-text">
                      {p.net > 0
                        ? <><span className="font-semibold">{p.other_name}</span> owes you</>
                        : <>you owe <span className="font-semibold">{p.other_name}</span></>}
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

          {/* Per-event math */}
          <div className="mt-3 border-t border-border/20 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">By event</div>
            {row.lines.length === 0 ? (
              <div className="mt-1 text-xs text-muted">No finalized events yet.</div>
            ) : (
              <ul className="mt-1 space-y-1 text-xs">
                {row.lines.map((l) => (
                  <li key={l.event_id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-text">{l.event_name}</span>
                      <span className="block text-[11px] text-muted">
                        {l.participants} × {money(l.fee)} = {money(l.pot)} pot ·{" "}
                        {l.won
                          ? l.co_winners > 1
                            ? `won (split ${l.co_winners} ways)`
                            : "you won the pot"
                          : `won by ${l.winner_names.join(", ")}`}
                      </span>
                    </span>
                    <span
                      style={l.net > 0 ? { color: UP } : undefined}
                      className={`tabular-nums font-semibold ${l.net > 0 ? "" : "text-danger"}`}
                    >
                      {l.net > 0 ? "+" : ""}{money(l.net)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-[10px] text-muted">
            ${row.lines[0]?.fee ?? 25}/player per event · winner takes the pot.
          </p>
        </div>
      )}
    </span>
  );
}
