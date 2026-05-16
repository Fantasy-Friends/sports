"use client";

import AppShell from "@/components/AppShell";

export default function ChrisTrackerPage() {
  return (
    <AppShell
      title="Chris Tracker"
      subtitle="BAC · caffeine · hydration · substances"
    >
      <div className="overflow-hidden rounded-[1.5rem] border border-border/40 bg-[#080a0f]">
        <iframe
          src="/chris-tracker.html"
          title="Chris Tracker"
          className="block w-full"
          style={{ height: "calc(100vh - 14rem)", minHeight: "640px", border: 0 }}
        />
      </div>
    </AppShell>
  );
}
