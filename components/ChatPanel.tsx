"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { initialsFor, tintFor } from "@/lib/avatarTint";

type ChatMessage = {
  message_id: string;
  entrant_id: string;
  display_name: string;
  body: string;
  created_at: string;
};

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold text-white"
      style={{ background: tintFor(name) }}
      aria-label={name}
    >
      {initialsFor(name)}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function ChatPanel({ meEntrantId }: { meEntrantId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Load history
  useEffect(() => {
    void fetch("/api/chat/messages", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMessages(j?.messages ?? []));
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => {
            // Deduplicate — our optimistic insert may have already added it
            if (prev.some((m) => m.message_id === msg.message_id)) return prev;
            return [...prev, msg];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div className="flex-1 space-y-3 overflow-y-auto py-1 pr-0.5">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted">No messages yet. Say something!</p>
        )}
        {messages.map((m) => {
          const isMe = m.entrant_id === meEntrantId;
          return (
            <div key={m.message_id} className={`flex gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
              <Avatar name={m.display_name} />
              <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                {!isMe && (
                  <span className="text-[10px] font-semibold text-muted">{m.display_name}</span>
                )}
                <div
                  className={`rounded-xl px-2.5 py-1.5 text-xs leading-snug ${
                    isMe
                      ? "rounded-tr-sm bg-accent text-white"
                      : "rounded-tl-sm bg-surface text-text border border-border/40"
                  }`}
                >
                  {m.body}
                </div>
                <span className="text-[9px] text-muted/60">{formatTime(m.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-2 flex gap-1.5">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 500))}
          onKeyDown={onKeyDown}
          placeholder="Say something…"
          className="flex-1 resize-none rounded-xl border border-border/50 bg-surface px-3 py-2 text-xs text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!input.trim() || sending}
          className="shrink-0 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
