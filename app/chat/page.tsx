"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ChatPanel from "@/components/ChatPanel";

type Entrant = { entrant_id: string };

export default function ChatPage() {
  const [entrantId, setEntrantId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setEntrantId((j?.entrant as Entrant | null)?.entrant_id ?? null));
  }, []);

  return (
    <AppShell title="Chat" hideHeading>
      <div className="flex h-[calc(100vh-8rem)] flex-col">
        {entrantId ? (
          <ChatPanel meEntrantId={entrantId} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Loading&hellip;
          </div>
        )}
      </div>
    </AppShell>
  );
}
