import { parseLesson, type Inline } from "@/lib/learn/core";

const Txt = ({ parts }: { parts: Inline[] }) => <>{parts.map((p, i) => (p.b ? <strong key={i} className="font-semibold text-ink">{p.t}</strong> : <span key={i}>{p.t}</span>))}</>;

/** A lesson's text (simple Markdown) as tidy blocks. The first heading repeats the title, so it's skipped. */
export function LessonBody({ content, title }: { content: string; title: string }) {
  const blocks = parseLesson(content);
  if (blocks[0]?.k === "h2" && blocks[0].text.map((x) => x.t).join("").trim().toLowerCase() === title.trim().toLowerCase()) blocks.shift();
  return (
    <div className="space-y-3 text-[1rem] leading-relaxed text-ink-muted">
      {blocks.map((b, i) => {
        switch (b.k) {
          case "h2": return <h2 key={i} className="pt-4 text-[1.25rem] font-bold tracking-tight text-ink"><Txt parts={b.text} /></h2>;
          case "h3": return <h3 key={i} className="pt-2 text-[1.0625rem] font-semibold text-[var(--b)]"><Txt parts={b.text} /></h3>;
          case "p": return <p key={i}><Txt parts={b.text} /></p>;
          case "ul": return <ul key={i} className="list-disc space-y-1 pl-6 marker:text-[var(--b)]">{b.items.map((it, j) => <li key={j}><Txt parts={it} /></li>)}</ul>;
          case "ol": return <ol key={i} className="list-decimal space-y-1 pl-6 marker:font-semibold marker:text-ink">{b.items.map((it, j) => <li key={j}><Txt parts={it} /></li>)}</ol>;
          case "quote": return <blockquote key={i} className="space-y-1 rounded-r-xl border-l-4 border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_6%,transparent)] px-4 py-3 font-medium text-ink">{b.lines.map((l, j) => <p key={j}><Txt parts={l} /></p>)}</blockquote>;
          case "code": return <pre key={i} className="overflow-x-auto rounded-xl bg-zinc-100 px-4 py-3 text-center text-[0.9375rem] font-semibold text-ink">{b.text}</pre>;
          case "hr": return <hr key={i} className="my-2 border-line" />;
          case "table": return (
            <div key={i} className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[420px] text-left text-[0.875rem]">
                <thead className="bg-zinc-50 text-ink"><tr>{b.head.map((h, j) => <th key={j} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="px-3 py-2 align-top">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
      })}
    </div>
  );
}
