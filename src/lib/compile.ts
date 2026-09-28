import { unionBounds } from "@/editor/geometry";
import type { Bounds, Shape } from "@/editor/types";
import { buildTree, toColumns, toRows, type LayoutNode } from "./layout";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const pct = (n: number) => `${Math.max(0, Math.round(n * 1000) / 10)}%`;

function element(node: LayoutNode, depth: number): string {
  const s = node.shape!;
  const text = s.text.trim();
  const inner = () => (node.children.length ? rows(node, depth + 1) : text ? `<p>${esc(text)}</p>` : "");
  const minH = `style="min-height:${Math.round(node.bounds.h)}px"`;

  if (s.kind === "text") {
    const tag = s.size >= 28 ? "h1" : s.size >= 20 ? "h2" : "p";
    return `<${tag}>${esc(text).replace(/\n/g, "<br>")}</${tag}>`;
  }
  if (s.kind === "ellipse") return `<div class="avatar" role="img" aria-label="${esc(text || "Avatar")}">${esc(text.slice(0, 2))}</div>`;
  switch (s.role) {
    case "button":
      return `<button type="button">${esc(text || "Button")}</button>`;
    case "input": {
      const label = text || "Input";
      return `<label class="field"><span class="sr-only">${esc(label)}</span><input placeholder="${esc(label)}"></label>`;
    }
    case "image":
      return `<div class="img" role="img" aria-label="${esc(text || "Image")}" ${minH}><span>${esc(text)}</span></div>`;
    case "nav": {
      const links = text
        .split(/[|,·•]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const [brand, ...items] = links.length ? links : ["Brand"];
      return `<nav><strong>${esc(brand)}</strong><ul>${items.map((l) => `<li><a href="#">${esc(l)}</a></li>`).join("")}</ul>${node.children.length ? rows(node, depth + 1) : ""}</nav>`;
    }
    default:
      return `<section class="card" ${minH}>${inner()}</section>`;
  }
}

function rows(parent: LayoutNode, depth: number): string {
  return stack(parent.children, parent.bounds, depth);
}

/** Lays nodes out as rows; within a row, vertically stacked items become a nested column. */
function stack(nodes: LayoutNode[], pb: Bounds, depth: number): string {
  let prevBottom = pb.y;
  return toRows(nodes)
    .map((row) => {
      const top = Math.min(...row.map((n) => n.bounds.y));
      const gap = Math.max(0, Math.round(top - prevBottom));
      prevBottom = Math.max(...row.map((n) => n.bounds.y + n.bounds.h));
      let prevRight = pb.x;
      const cells = toColumns(row)
        .map((col) => {
          const cb = unionBounds(col.map((n) => n.bounds))!;
          const ml = (cb.x - prevRight) / pb.w;
          prevRight = cb.x + cb.w;
          const mt = Math.round(cb.y - top);
          // Overlapping shapes can't be split further; stack them plainly instead of recursing forever.
          const content =
            col.length === 1
              ? element(col[0], depth)
              : col.length === nodes.length
                ? col.map((n) => element(n, depth)).join("")
                : stack(col, cb, depth);
          return `<div class="cell" style="flex:0 0 ${pct(cb.w / pb.w)};margin-left:${pct(ml)};margin-top:${mt}px">${content}</div>`;
        })
        .join("");
      return `<div class="row" style="margin-top:${Math.min(gap, 96)}px">${cells}</div>`;
    })
    .join("\n");
}

const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2328;background:#f6f7f9;line-height:1.5}
main{max-width:1100px;margin:0 auto;padding:24px}
.row{display:flex;align-items:flex-start}.cell{min-width:0}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.card>p{margin:0;color:#57606a}
h1{font-size:clamp(28px,4vw,44px);line-height:1.1;margin:0}h2{font-size:22px;margin:0}p{margin:0}
button{width:100%;min-height:40px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:600 15px system-ui;cursor:pointer;padding:10px 16px}
button:hover{background:#1d4ed8}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
.field{display:block}input{width:100%;min-height:40px;border:1px solid #d0d7de;border-radius:10px;padding:10px 12px;font:15px system-ui;background:#fff}
.img{display:grid;place-items:center;border-radius:12px;background:linear-gradient(135deg,#c7d2fe,#a5b4fc 40%,#818cf8);color:#312e81;font-weight:600}
.avatar{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#e0e7ff;color:#3730a3;font-weight:700;text-transform:uppercase}
nav{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px}
nav ul{display:flex;gap:18px;list-style:none;margin:0;padding:0}nav a{color:#1f2328;text-decoration:none}nav a:hover{color:#2563eb}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2328;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .2s}
.toast.show{opacity:1}
@media (max-width:640px){.row{flex-direction:column;gap:12px}.cell{flex-basis:auto!important;width:100%;margin-left:0!important;margin-top:0!important}nav ul{display:none}}
`;

const SCRIPT = `
const toast=document.createElement('div');toast.className='toast';toast.setAttribute('role','status');document.body.appendChild(toast);
let t;document.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;e.preventDefault();
toast.textContent='“'+b.textContent.trim()+'” clicked';toast.classList.add('show');clearTimeout(t);t=setTimeout(()=>toast.classList.remove('show'),1400)});
`;

/** Deterministic wireframe → HTML compiler used when no AI key is configured. */
export function compileToHtml(shapes: Shape[]): string {
  const tree = buildTree(shapes);
  const body = tree ? rows(tree, 0) : "<p>Draw something on the canvas first.</p>";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prototype</title>
<style>${CSS}</style>
</head>
<body>
<main>
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
