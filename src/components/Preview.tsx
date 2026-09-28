"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { injectBridge, isBridgeMessage } from "@/lib/bridge";

const DEVICES = [
  { id: "desktop", label: "Desktop", width: null },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 390 },
] as const;
type DeviceId = (typeof DEVICES)[number]["id"];

interface Props {
  html: string;
  code: string;
  streaming: boolean;
}

export function Preview({ html, code, streaming }: Props) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [errors, setErrors] = useState<{ doc: string; messages: string[] }>({ doc: "", messages: [] });
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const srcDoc = useMemo(() => (html ? injectBridge(html) : ""), [html]);
  const runtimeErrors = errors.doc === srcDoc ? errors.messages : [];

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // The iframe has an opaque origin, so identify it by window reference, not origin.
      if (e.source !== iframeRef.current?.contentWindow || !isBridgeMessage(e.data)) return;
      const data = e.data;
      if (data.type === "error") {
        setErrors((prev) => {
          const base = prev.doc === srcDoc ? prev.messages : [];
          return { doc: srcDoc, messages: [...base, data.message.slice(0, 300)].slice(-5) };
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [srcDoc]);

  useEffect(() => {
    if (streaming && tab === "code" && codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight;
  }, [code, streaming, tab]);

  const width = DEVICES.find((d) => d.id === device)?.width;

  function download() {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "prototype.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div role="tablist" aria-label="Output view" className="flex rounded-lg bg-surface-2 p-0.5 text-sm">
          {(["preview", "code"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 capitalize ${tab === t ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-sm">
          {tab === "preview" &&
            DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={device === d.id}
                onClick={() => setDevice(d.id)}
                className={`rounded-md px-2 py-1 ${device === d.id ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"}`}
              >
                {d.label}
              </button>
            ))}
          {tab === "code" && (
            <button type="button" onClick={copy} disabled={!html || streaming} className="rounded-md px-2 py-1 text-muted hover:text-ink disabled:opacity-40">
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button type="button" onClick={download} disabled={!html || streaming} className="rounded-md px-2 py-1 text-muted hover:text-ink disabled:opacity-40">
            Download
          </button>
        </div>
      </div>

      <div id="panel-preview" role="tabpanel" hidden={tab !== "preview"} className="relative min-h-0 flex-1 overflow-auto bg-surface-2">
        {html ? (
          <div className="mx-auto h-full transition-[width]" style={{ width: width ? Math.min(width, 100000) : "100%", maxWidth: "100%" }}>
            <iframe
              ref={iframeRef}
              title="Generated prototype"
              sandbox="allow-scripts allow-forms"
              referrerPolicy="no-referrer"
              srcDoc={srcDoc}
              className="h-full w-full border-0 bg-white"
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">
            <p>
              Sketch a screen on the left, then press <strong className="text-ink">Generate</strong>.<br />
              The prototype streams in here as it&apos;s written.
            </p>
          </div>
        )}
        {runtimeErrors.length > 0 && !streaming && (
          <div role="status" className="absolute inset-x-3 bottom-3 rounded-lg border border-danger/40 bg-surface p-3 text-xs shadow-lg">
            <p className="font-semibold text-danger">The prototype reported {runtimeErrors.length === 1 ? "an error" : `${runtimeErrors.length} errors`}</p>
            <ul className="mt-1 space-y-0.5 font-mono text-muted">
              {runtimeErrors.map((m, i) => (
                <li key={i} className="truncate">
                  {m}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted">Try “Refine” with “fix the JavaScript errors”.</p>
          </div>
        )}
      </div>

      <div id="panel-code" role="tabpanel" hidden={tab !== "code"} className="min-h-0 flex-1 overflow-hidden">
        <pre ref={codeRef} className="h-full overflow-auto whitespace-pre-wrap break-words bg-[var(--code-bg)] p-4 font-mono text-xs leading-relaxed text-[var(--code-ink)]">
          {code || "No code yet."}
          {streaming && <span className="animate-pulse">▍</span>}
        </pre>
      </div>
    </div>
  );
}
