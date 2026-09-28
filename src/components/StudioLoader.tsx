"use client";

import dynamic from "next/dynamic";

// The studio reads localStorage during initial state, so it renders on the client only.
const Studio = dynamic(() => import("./Studio"), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center text-sm text-muted">Loading studio…</div>,
});

export function StudioLoader({ aiEnabled }: { aiEnabled: boolean }) {
  return <Studio aiEnabled={aiEnabled} />;
}
