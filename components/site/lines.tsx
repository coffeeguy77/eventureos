import { Fragment } from "react";

/** Editable heading text: "|" breaks the line, *stars* colour words in the brand pink. */
export function Lines({ text, breakClass, pinkClass = "text-[var(--pk)]" }: { text: string; breakClass?: string; pinkClass?: string }) {
  const parts = text.split(/\s*\|\s*/);
  return (
    <>
      {parts.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br className={breakClass} />}
          {line.split(/(\*[^*]+\*)/).map((p, j) => (/^\*[^*]+\*$/.test(p) ? <span key={j} className={pinkClass}>{p.slice(1, -1)}</span> : <Fragment key={j}>{p}</Fragment>))}
        </Fragment>
      ))}
    </>
  );
}
