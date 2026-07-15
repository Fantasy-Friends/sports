"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type QueueGolfer = {
  name: string;
  rank: number | null;
  drafted: boolean;
  draftedBy: string | null;
};

// A reorderable personal draft queue. Reorder by dragging the handle (works on
// touch + mouse via pointer events) or with the up/down buttons; one tap on
// "Sort by rank" orders the whole list by golfer rank.
export default function DraftQueuePanel({
  items,
  canPickNow,
  savingPicks,
  onReorder,
  onSortByRank,
  onRemove,
  onDraft,
  onClear,
}: {
  items: QueueGolfer[];
  canPickNow: boolean;
  savingPicks: boolean;
  onReorder: (from: number, to: number) => void;
  onSortByRank: () => void;
  onRemove: (name: string) => void;
  onDraft: (name: string) => void;
  onClear: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function indexFromPoint(clientX: number, clientY: number): number | null {
    const el = document.elementFromPoint(clientX, clientY);
    const row = el?.closest<HTMLElement>("[data-qindex]");
    if (!row) return null;
    const idx = Number(row.dataset.qindex);
    return Number.isFinite(idx) ? idx : null;
  }

  function handlePointerDown(e: ReactPointerEvent, index: number) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragIndex(index);
    setOverIndex(index);
  }
  function handlePointerMove(e: ReactPointerEvent) {
    if (dragIndex === null) return;
    const idx = indexFromPoint(e.clientX, e.clientY);
    if (idx !== null) setOverIndex(idx);
  }
  function handlePointerUp() {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      onReorder(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  if (items.length === 0) {
    return (
      <div className="text-xs text-muted">
        Your queue is empty. Tap <span className="font-semibold">＋ Queue</span> on any golfer to plan ahead.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSortByRank}
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
        >
          Sort by rank
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
        >
          Clear queue
        </button>
        <span className="ml-auto text-[11px] text-muted">Drag the handle or use ↑↓ to reorder</span>
      </div>

      <ul
        ref={listRef}
        className="space-y-1.5"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {items.map((item, index) => {
          const isDragging = dragIndex === index;
          const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <li
              key={item.name}
              data-qindex={index}
              className={[
                "flex items-center gap-2 rounded-xl border bg-bg/50 px-2.5 py-2",
                isDragging ? "border-accent/70 opacity-60" : "border-border/60",
                isOver ? "border-accent/70 ring-1 ring-accent/40" : "",
                item.drafted ? "opacity-50" : "",
              ].join(" ")}
            >
              {/* Drag handle */}
              <button
                type="button"
                aria-label={`Drag ${item.name} to reorder`}
                onPointerDown={(e) => handlePointerDown(e, index)}
                className="shrink-0 cursor-grab touch-none select-none px-1 text-muted active:cursor-grabbing"
              >
                <svg viewBox="0 0 12 20" className="h-4 w-3" fill="currentColor" aria-hidden="true">
                  <circle cx="3" cy="4" r="1.4" /><circle cx="9" cy="4" r="1.4" />
                  <circle cx="3" cy="10" r="1.4" /><circle cx="9" cy="10" r="1.4" />
                  <circle cx="3" cy="16" r="1.4" /><circle cx="9" cy="16" r="1.4" />
                </svg>
              </button>

              <span className="w-5 shrink-0 text-center text-[11px] font-semibold text-muted">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-medium ${item.drafted ? "line-through" : ""}`}>
                  {item.name}
                </div>
                <div className="text-[11px] text-muted">
                  {item.rank !== null ? `Rank #${item.rank}` : "Unranked"}
                  {item.drafted ? ` · drafted${item.draftedBy ? ` by ${item.draftedBy}` : ""}` : ""}
                </div>
              </div>

              {/* Up / down (reliable everywhere, esp. touch) */}
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label={`Move ${item.name} up`}
                  disabled={index === 0}
                  onClick={() => onReorder(index, index - 1)}
                  className="px-1 text-xs text-muted disabled:opacity-30 hover:text-text"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${item.name} down`}
                  disabled={index === items.length - 1}
                  onClick={() => onReorder(index, index + 1)}
                  className="px-1 text-xs text-muted disabled:opacity-30 hover:text-text"
                >
                  ▼
                </button>
              </div>

              {/* Draft (when on the clock & available) */}
              {!item.drafted && canPickNow && (
                <button
                  type="button"
                  disabled={savingPicks}
                  onClick={() => onDraft(item.name)}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                >
                  Draft
                </button>
              )}

              {/* Remove from queue */}
              <button
                type="button"
                aria-label={`Remove ${item.name} from queue`}
                onClick={() => onRemove(item.name)}
                className="shrink-0 rounded-md border border-border/50 px-2 py-1 text-[11px] text-muted hover:border-danger/50 hover:text-danger"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
