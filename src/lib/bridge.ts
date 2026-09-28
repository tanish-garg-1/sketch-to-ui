export const BRIDGE_SOURCE = "sketch2ui-preview";

export type BridgeMessage =
  | { source: typeof BRIDGE_SOURCE; type: "error"; message: string }
  | { source: typeof BRIDGE_SOURCE; type: "ready" };

// Runs inside the sandboxed (opaque-origin) iframe. It reports runtime errors
// to the parent and keeps link clicks from navigating the preview away.
const BRIDGE_SCRIPT = `<script>(()=>{const send=(m)=>parent.postMessage(Object.assign({source:${JSON.stringify(BRIDGE_SOURCE)}},m),"*");
addEventListener("error",e=>send({type:"error",message:String(e.message||"Script error")}));
addEventListener("unhandledrejection",e=>send({type:"error",message:"Unhandled promise rejection: "+String(e.reason&&e.reason.message||e.reason)}));
document.addEventListener("click",e=>{const a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a&&!a.getAttribute("href").startsWith("#"))e.preventDefault()},true);
addEventListener("load",()=>send({type:"ready"}));})();</script>`;

export function injectBridge(html: string): string {
  const head = html.match(/<head[^>]*>/i);
  if (head?.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + BRIDGE_SCRIPT + html.slice(at);
  }
  return BRIDGE_SCRIPT + html;
}

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  return typeof data === "object" && data !== null && (data as { source?: unknown }).source === BRIDGE_SOURCE;
}
