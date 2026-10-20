"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Flame, GraduationCap, Loader2, Pause, Play, RotateCcw, Save, Square } from "lucide-react";
import {
  createInitialState, evaluateRoast, formatTimeSec, getBeanColor, getStageInfo, MARKER_EXPLANATIONS, scoreChallengeAccuracy, scoreRoast, simulateTick,
  TARGET_CURVE, TRAINING_STEPS, type RoastState,
} from "@/lib/learn/roast-sim";
import { saveRoastAction } from "@/app/academy/actions";
import { btn, btnGhost, field } from "./ui";
import { cn } from "@/lib/cn";

const SPEEDS = [1, 4, 10];

/** Which training step's trigger has happened */
function triggered(trigger: string, s: RoastState) {
  switch (trigger) {
    case "start": return s.isRunning || s.time > 0;
    case "turning_point": return s.turningPointReached;
    case "temp_150": return s.turningPointReached && s.bt >= 150;
    case "temp_165": return s.turningPointReached && s.bt >= 165;
    case "temp_185": return s.turningPointReached && s.bt >= 185;
    case "first_crack": return s.firstCrackTime !== null;
    case "temp_205": return s.firstCrackTime !== null && s.bt >= 205;
    case "drop_ready": return s.dropped;
    default: return false;
  }
}

function Chart({ s }: { s: RoastState }) {
  const W = 760, H = 320, L = 44, R = 40, T = 14, B = 30;
  const maxT = Math.max(720, Math.ceil((s.time + 60) / 60) * 60);
  const x = (t: number) => L + (t / maxT) * (W - L - R);
  const y = (bt: number) => T + (1 - (bt - 20) / (260 - 20)) * (H - T - B);
  const yr = (ror: number) => T + (1 - (Math.max(-10, Math.min(40, ror)) + 10) / 50) * (H - T - B);
  const path = (pts: { time: number; v: number }[], f: (v: number) => number) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${f(p.v).toFixed(1)}`).join("");
  const hist = s.history;
  const markers = [
    s.turningPointTime !== null && { t: s.turningPointTime, label: "TP", key: "turning_point", c: "#64B5F6" },
    s.firstCrackTime !== null && { t: s.firstCrackTime, label: "1C", key: "first_crack", c: "#FFB020" },
    s.secondCrackTime !== null && { t: s.secondCrackTime, label: "2C", key: "second_crack", c: "#F87171" },
    s.dropTime !== null && { t: s.dropTime, label: "Drop", key: "drop", c: "#34D399" },
  ].filter(Boolean) as { t: number; label: string; key: string; c: string }[];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Roast curve: bean temperature and rate of rise over time">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#fafaf9" rx="6" />
      {[50, 100, 150, 200, 250].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e7e5e4" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#78716c">{v}°</text></g>)}
      {Array.from({ length: maxT / 60 + 1 }, (_, i) => i).filter((m) => m % (maxT > 900 ? 2 : 1) === 0).map((m) => <text key={m} x={x(m * 60)} y={H - 10} textAnchor="middle" fontSize="11" fill="#78716c">{m}:00</text>)}
      {[0, 20, 40].map((v) => <text key={v} x={W - R + 6} y={yr(v) + 4} fontSize="10" fill="#a8a29e">{v}</text>)}
      <path d={path(TARGET_CURVE.map((p) => ({ time: p.time, v: p.bt })), y)} fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeDasharray="5 5" />
      {hist.length > 1 && <path d={path(hist.filter((p) => p.time > 20).map((p) => ({ time: p.time, v: p.ror })), yr)} fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8" />}
      {hist.length > 1 && <path d={path(hist.map((p) => ({ time: p.time, v: p.bt })), y)} fill="none" stroke="var(--b)" strokeWidth="2.5" />}
      {markers.map((m) => <g key={m.key}><line x1={x(m.t)} x2={x(m.t)} y1={T} y2={H - B} stroke={m.c} strokeDasharray="3 3" /><text x={x(m.t) + 3} y={T + 12} fontSize="11" fontWeight="700" fill={m.c}><title>{MARKER_EXPLANATIONS[m.key]}</title>{m.label}</text></g>)}
      <text x={L + 8} y={H - B - 8} fontSize="11" fill="#78716c">— Bean temp · <tspan fill="#60a5fa">— Rate of rise (°C/min, right)</tspan> · <tspan fill="#a8a29e">- - Target</tspan></text>
    </svg>
  );
}

function Slider({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[0.875rem] font-medium text-ink"><span>{label}</span><span className="tabular-nums text-ink-muted">{value}%{hint ? ` · ${hint}` : ""}</span></span>
      <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--b)]" />
    </label>
  );
}

export function RoastSimulator({ slug, canSave }: { slug: string; canSave: boolean }) {
  const [s, setS] = useState<RoastState>(createInitialState);
  const [speed, setSpeed] = useState(4);
  const [training, setTraining] = useState(true);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (s.isRunning && !s.dropped) timer.current = setInterval(() => setS((p) => simulateTick(p)), 1000 / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [s.isRunning, s.dropped, speed]);

  // Move the training steps along as their moments happen
  useEffect(() => {
    if (!training) return;
    const step = TRAINING_STEPS[s.trainStepIndex];
    if (step && triggered(step.trigger, s) && s.trainStepIndex < TRAINING_STEPS.length - 1) setS((p) => ({ ...p, trainStepIndex: p.trainStepIndex + 1 }));
  }, [s, training]);

  const stage = getStageInfo(s.bt, s.firstCrackTime);
  const step = training ? TRAINING_STEPS[s.trainStepIndex] : null;
  const result = useMemo(() => {
    if (!s.dropped) return null;
    const score = scoreRoast(s.history, s.firstCrackTime, s.dropTime);
    const issues = evaluateRoast(s.history, s.firstCrackTime, s.dropTime);
    const dev = s.firstCrackTime !== null && s.dropTime ? ((s.dropTime - s.firstCrackTime) / s.dropTime) * 100 : null;
    return { score, issues, dev, accuracy: scoreChallengeAccuracy(s.history, TARGET_CURVE) };
  }, [s.dropped, s.history, s.firstCrackTime, s.dropTime]);

  const set = (patch: Partial<RoastState>) => setS((p) => ({ ...p, ...patch }));
  const drop = () => set({ dropped: true, isRunning: false, dropTime: s.time });
  const reset = () => { setS(createInitialState()); setSaved(null); setErr(null); };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Time", formatTimeSec(s.time)], ["Bean temp", `${s.bt.toFixed(1)}°C`], ["Rate of rise", `${s.time > 20 ? s.ror.toFixed(1) : "—"} °C/min`]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-zinc-50 px-3 py-2"><p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">{k}</p><p className="text-[1.25rem] font-bold tabular-nums text-ink">{v}</p></div>
            ))}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: `${stage.color}22` }}>
              <span className="h-8 w-8 shrink-0 rounded-full ring-2 ring-white" style={{ background: getBeanColor(s.bt) }} aria-hidden />
              <span><span className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">Stage</span><span className="block text-[0.9375rem] font-bold" style={{ color: stage.color }}>{stage.label}</span></span>
            </div>
          </div>
          <Chart s={s} />
        </section>

        {result && (
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">Roast score</p><p className="text-[2.25rem] font-bold leading-none text-ink">{result.score.toFixed(1)}<span className="text-[1rem] text-ink-faint"> / 10</span></p></div>
              <div className="text-right text-[0.875rem] text-ink-muted">
                <p>Total {formatTimeSec(s.dropTime ?? s.time)} · drop at {s.bt.toFixed(1)}°C</p>
                {result.dev !== null && <p>Development {result.dev.toFixed(1)}% (aim 15–25%)</p>}
                <p>Matched the target curve {result.accuracy}%</p>
              </div>
            </div>
            {result.issues.length === 0 ? <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-[0.9063rem] text-emerald-800">Clean roast — no issues found.</p> : (
              <ul className="mt-3 space-y-2">{result.issues.map((i) => (
                <li key={i.title} className={cn("rounded-xl px-4 py-3 text-[0.875rem]", i.severity === "high" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900")}><span className="font-semibold">{i.title}.</span> {i.description}</li>
              ))}</ul>
            )}
            {canSave && !saved && (
              <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => {
                const r = await saveRoastAction(slug, { name, history: s.history, firstCrack: s.firstCrackTime, drop: s.dropTime });
                if (!r.ok) { setErr(r.error); return; }
                setSaved(`Saved${r.xp ? ` · +${r.xp} XP` : ""}${r.badges.length ? ` · New badge: ${r.badges.join(", ")}` : ""}`);
              }); }}>
                <input className={`${field} h-11 min-w-0 flex-1`} placeholder="Name this roast (e.g. Brazil medium)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                <button className={btn} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save roast</button>
              </form>
            )}
            {saved && <p className="mt-3 text-[0.9063rem] font-medium text-emerald-700">{saved}</p>}
            {err && <p className="mt-3 text-[0.875rem] font-medium text-rose-700">{err}</p>}
          </section>
        )}
      </div>

      <aside className="space-y-4">
        {step && !s.dropped && (
          <section className="rounded-2xl border border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_6%,transparent)] p-4">
            <p className="flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-[var(--b)]"><GraduationCap className="h-4 w-4" />Step {step.id + 1} of {TRAINING_STEPS.length}</p>
            <p className="mt-1 text-[1rem] font-semibold text-ink">{step.title}</p>
            <p className="mt-1 text-[0.875rem] text-ink-muted">{step.instruction}</p>
          </section>
        )}
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <Slider label="Gas" value={s.gas} onChange={(v) => set({ gas: v })} hint={step?.targetGas !== undefined ? `aim ${step.targetGas}` : undefined} />
          <Slider label="Airflow" value={s.airflow} onChange={(v) => set({ airflow: v })} hint={step?.targetAirflow !== undefined ? `aim ${step.targetAirflow}` : undefined} />
          <Slider label="Drum speed" value={s.drum} onChange={(v) => set({ drum: v })} />
          <div className="grid grid-cols-2 gap-2">
            {!s.dropped && (s.isRunning
              ? <button type="button" className={btnGhost} onClick={() => set({ isRunning: false })}><Pause className="h-4 w-4" />Pause</button>
              : <button type="button" className={btn} onClick={() => set({ isRunning: true })}><Play className="h-4 w-4" />{s.time ? "Resume" : "Charge & start"}</button>)}
            {!s.dropped && <button type="button" className={btnGhost} disabled={s.time < 30} onClick={drop}><Square className="h-4 w-4" />Drop</button>}
            <button type="button" className={cn(btnGhost, s.dropped && "col-span-2")} onClick={reset}><RotateCcw className="h-4 w-4" />New roast</button>
          </div>
          <div>
            <p className="mb-1.5 text-[0.8125rem] font-medium text-ink">Speed</p>
            <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
              {SPEEDS.map((v) => <button key={v} type="button" onClick={() => setSpeed(v)} className={cn("h-9 flex-1 rounded-lg text-[0.875rem] font-semibold", speed === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{v}×</button>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[0.875rem] text-ink"><input type="checkbox" className="h-4 w-4 accent-[var(--b)]" checked={training} onChange={(e) => setTraining(e.target.checked)} />Guided training steps</label>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4 text-[0.8125rem] text-ink-muted shadow-card">
          <p className="flex items-center gap-1.5 font-semibold text-ink"><Flame className="h-4 w-4 text-orange-500" />How it scores</p>
          <p className="mt-1">Starts at 10 and loses points for an under- or over-developed roast, no first crack, a rate-of-rise crash, baking (a flat rate of rise) and roasting too fast. Aim for 9–13 minutes with 15–25% development.</p>
        </section>
      </aside>
    </div>
  );
}
