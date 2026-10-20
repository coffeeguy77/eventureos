// ── Coffee Roasting Simulation Engine ──
// Moved as-is from the Replit "Barista Course" app (artifacts/bean-culture/data/roastSimEngine.ts).
// Models realistic bean temperature response to gas, airflow, and drum speed controls. Pure — runs in the browser.

export interface RoastState {
  time: number;
  bt: number;
  prevBt: number;
  ror: number;
  gas: number;      // 0-100 %
  airflow: number;  // 0-100 %
  drum: number;     // 0-100 %
  stage: string;
  isRunning: boolean;
  turningPointReached: boolean;
  turningPointTime: number | null;
  firstCrackTime: number | null;
  secondCrackTime: number | null;
  dropped: boolean;
  dropTime: number | null;
  history: Array<{ time: number; bt: number; ror: number }>;
  trainStepIndex: number;
}

export interface TrainingStep {
  id: number;
  title: string;
  instruction: string;
  trigger: string;
  targetGas?: number;
  targetAirflow?: number;
}

export const STAGES: Record<string, { min: number; max: number; label: string; color: string }> = {
  DRYING:       { min: 0,   max: 150, label: "Drying",       color: "#C4A86B" },
  MAILLARD:     { min: 150, max: 190, label: "Maillard",     color: "#8B6914" },
  FIRST_CRACK:  { min: 190, max: 205, label: "First Crack",  color: "#FF6B35" },
  DEVELOPMENT:  { min: 205, max: 225, label: "Development",  color: "#E8B171" },
  SECOND_CRACK: { min: 225, max: 250, label: "Second Crack", color: "#E86C6C" },
};

export const TARGET_CURVE = [
  { time: 0,   bt: 200 }, { time: 30,  bt: 165 }, { time: 60,  bt: 132 },
  { time: 90,  bt: 100 }, { time: 120, bt: 105 }, { time: 150, bt: 115 },
  { time: 180, bt: 125 }, { time: 210, bt: 135 }, { time: 240, bt: 144 },
  { time: 270, bt: 152 }, { time: 300, bt: 159 }, { time: 330, bt: 165 },
  { time: 360, bt: 170 }, { time: 390, bt: 175 }, { time: 420, bt: 180 },
  { time: 450, bt: 185 }, { time: 480, bt: 189 }, { time: 510, bt: 193 },
  { time: 540, bt: 196 }, { time: 570, bt: 199 }, { time: 600, bt: 201 },
  { time: 630, bt: 203 }, { time: 660, bt: 205 }, { time: 690, bt: 207 },
  { time: 720, bt: 209 },
];

export const TRAINING_STEPS: TrainingStep[] = [
  { id: 0, title: "Charge the Beans",      trigger: "start",        targetGas: 80,
    instruction: "Set Gas to 80%+ and hit Start. Watch the temperature drop as green beans absorb heat from the drum." },
  { id: 1, title: "Find the Turning Point", trigger: "turning_point",
    instruction: "The bean temp will hit its lowest point then start climbing. This is the Turning Point — the roast truly begins here." },
  { id: 2, title: "Build Momentum",         trigger: "temp_150",     targetGas: 70,
    instruction: "Keep the gas around 70% as beans climb through 120-150°C. The Rate of Rise should be 15-20°C/min." },
  { id: 3, title: "Enter Maillard Phase",   trigger: "temp_165",     targetGas: 55,
    instruction: "Reduce gas to 55-60%. This is where sugars start browning. Drop airflow slightly to hold heat." },
  { id: 4, title: "Approach First Crack",   trigger: "temp_185",     targetGas: 40, targetAirflow: 60,
    instruction: "Lower gas to 40-45%. Increase airflow to 60%. You want a smooth, declining RoR going into first crack." },
  { id: 5, title: "First Crack!",           trigger: "first_crack",  targetGas: 25, targetAirflow: 70,
    instruction: "You hear the beans cracking! Drop gas to 25-30%. Increase airflow to 70%+. Development phase begins now." },
  { id: 6, title: "Development Phase",      trigger: "temp_205",     targetGas: 20,
    instruction: "Hold steady. Target 15-20% development time. The RoR should gently decline — no crashes or flicks." },
  { id: 7, title: "Drop the Roast!",        trigger: "drop_ready",
    instruction: "Hit the Drop button when you reach your target. For a medium roast, 208-212°C is ideal. Don't go past 215°C!" },
];

/** From the Replit app's roast-curve screen (sampleRoasts.ts) */
export const MARKER_EXPLANATIONS: Record<string, string> = {
  turning_point: "The bean temperature stops dropping and begins to rise — the roast truly begins here.",
  first_crack: "Beans undergo an exothermic reaction, making an audible crack. Structure expands, moisture escapes.",
  second_crack: "Cell walls break down. Oils migrate to surface. Dark roast territory.",
  drop: "Roast is complete — beans are dropped from drum into the cooler.",
  maillard: "Maillard reaction begins — amino acids and sugars react, creating complex flavors and browning.",
};

const CHARGE_TEMP = 200; // drum temperature at charge

export function createInitialState(): RoastState {
  return {
    time: 0, bt: CHARGE_TEMP, prevBt: CHARGE_TEMP, ror: 0,
    gas: 0, airflow: 40, drum: 60,
    stage: "DRYING", isRunning: false,
    turningPointReached: false, turningPointTime: null,
    firstCrackTime: null, secondCrackTime: null,
    dropped: false, dropTime: null,
    history: [], trainStepIndex: 0,
  };
}

export function getStageInfo(bt: number, firstCrackTime: number | null = null): { label: string; color: string } {
  if (bt >= 225) return STAGES.SECOND_CRACK;
  if (bt >= 205 && firstCrackTime !== null) return STAGES.DEVELOPMENT;
  if (firstCrackTime !== null) return STAGES.FIRST_CRACK;
  if (bt >= 150) return STAGES.MAILLARD;
  return STAGES.DRYING;
}

export function getBeanColor(bt: number): string {
  if (bt > 185) return "#4A2508";
  if (bt > 160) return "#7A4520";
  if (bt > 140) return "#A0622A";
  if (bt > 120) return "#C4903A";
  if (bt > 100) return "#B8A060";
  return "#7CB87A"; // green
}

export function formatTimeSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// ── Core simulation tick (called every 1 second) ──
export function simulateTick(state: RoastState): RoastState {
  if (!state.isRunning || state.dropped) return state;

  const dt = 1; // seconds per tick
  const newTime = state.time + dt;

  const gas = state.gas / 100;
  const airflow = state.airflow / 100;
  const drumMultiplier = state.drum < 33 ? 0.85 : state.drum > 66 ? 1.15 : 1.0;

  const bt = state.bt;
  const prevBt = state.prevBt;

  const isDrying   = bt < 150;
  const isMaillard = bt >= 150 && bt < 190;

  // Exothermic energy during first crack window (60s burst)
  let exothermicHeat = 0;
  if (state.firstCrackTime !== null) {
    const timeSinceCrack = newTime - state.firstCrackTime;
    if (timeSinceCrack < 60) exothermicHeat = 2.5 * Math.max(0, 1 - timeSinceCrack / 60);
  }

  const baseHeatRate      = gas * 28 * drumMultiplier;
  const airflowCooling    = airflow * 4.5;
  const airflowConvection = airflow * 2.0;
  const heatLoss          = (bt - 20) * 0.018;
  const inertia           = isDrying ? 0.45 : isMaillard ? 0.55 : 0.65;
  let netHeat = (baseHeatRate + airflowConvection + exothermicHeat - airflowCooling - heatLoss) * inertia;

  // Charge drop: green beans absorb heat from the drum steeply for first 2 minutes
  if (newTime < 120 && bt > 90) {
    const dropForce  = Math.max(0, (120 - newTime) / 120);
    const absorbRate = -CHARGE_TEMP * 0.012 * dropForce;
    netHeat = netHeat * (1 - dropForce) + absorbRate * dropForce * 30;
  }

  const tempChange = netHeat * (dt / 30);
  const newBt = Math.max(20, Math.min(260, bt + tempChange));
  const ror = ((newBt - prevBt) / dt) * 60;

  // Turning point: BT bottoms out and starts rising (requires bt to have dropped from charge temp)
  let turningPointReached = state.turningPointReached;
  let turningPointTime = state.turningPointTime;
  if (!turningPointReached && newTime > 30 && newBt > bt && bt <= prevBt) {
    turningPointReached = true;
    turningPointTime = newTime;
  }

  // First crack: only triggers AFTER the turning point so it can't fire at t=0 from 200°C start
  let firstCrackTime = state.firstCrackTime;
  if (firstCrackTime === null && turningPointReached && newBt >= 196) {
    firstCrackTime = newTime;
  }

  // Second crack
  let secondCrackTime = state.secondCrackTime;
  if (secondCrackTime === null && newBt >= 224) secondCrackTime = newTime;

  // Stage
  let stage = "DRYING";
  if (newBt >= 225) stage = "SECOND_CRACK";
  else if (newBt >= 205 && firstCrackTime !== null) stage = "DEVELOPMENT";
  else if (firstCrackTime !== null) stage = "FIRST_CRACK";
  else if (newBt >= 150) stage = "MAILLARD";

  const newHistory = [
    ...state.history,
    { time: newTime, bt: Math.round(newBt * 10) / 10, ror: Math.round(ror * 10) / 10 },
  ];

  return {
    ...state,
    time: newTime,
    bt: Math.round(newBt * 10) / 10,
    prevBt: bt,
    ror: Math.round(ror * 10) / 10,
    stage,
    turningPointReached, turningPointTime,
    firstCrackTime, secondCrackTime,
    history: newHistory,
  };
}

// ── Post-roast issue detection ──
export function evaluateRoast(
  history: Array<{ time: number; bt: number; ror: number }>,
  firstCrackTime: number | null,
  dropTime: number | null,
): Array<{ severity: "high" | "medium"; title: string; description: string }> {
  const issues: Array<{ severity: "high" | "medium"; title: string; description: string }> = [];
  const postTP = history.filter(p => p.time > 90);

  // Development time check
  if (firstCrackTime !== null && dropTime !== null) {
    const devTime = dropTime - firstCrackTime;
    const devPct  = (devTime / dropTime) * 100;
    if (devTime < 45)     issues.push({ severity: "high",   title: "Under-developed",  description: `Development was only ${devTime}s (${devPct.toFixed(1)}%). Aim for 15-25%. Extend the roast after first crack.` });
    else if (devTime > 180) issues.push({ severity: "medium", title: "Over-developed",   description: `Development was ${devTime}s (${devPct.toFixed(1)}%). Drop the roast earlier.` });
  } else if (firstCrackTime === null && dropTime !== null) {
    issues.push({ severity: "high", title: "No First Crack", description: "The roast ended before reaching first crack. The coffee will taste grassy and underdeveloped. Apply more heat — raise gas to 70%+ during Maillard." });
  }

  // RoR crash detection
  if (postTP.length > 10) {
    for (let i = 5; i < postTP.length; i++) {
      if (postTP[i - 1].ror - postTP[i].ror > 8) {
        issues.push({ severity: "medium", title: "RoR Crash Detected", description: "Rate of rise dropped sharply. Reduce gas changes more gradually — step down by small amounts every 30 seconds." });
        break;
      }
    }
  }

  // Stalling / baking
  let flatCount = 0;
  for (let k = 1; k < postTP.length; k++) {
    if (Math.abs(postTP[k].ror - postTP[k - 1].ror) < 1 && postTP[k].ror < 5) flatCount++;
  }
  if (flatCount > 20) {
    issues.push({ severity: "medium", title: "Potential Baking", description: "RoR flatlined for too long. Produces flat, bread-like flavours. Apply more heat earlier to maintain a steady decline." });
  }

  // Too fast
  if (dropTime !== null && dropTime < 360) {
    issues.push({ severity: "medium", title: "Roast Too Fast", description: `Total time ${formatTimeSec(dropTime)} is under 6 minutes. The outside develops faster than the inside. Reduce gas and target 9-13 minutes total.` });
  }

  return issues;
}

export function scoreRoast(
  history: Array<{ time: number; bt: number; ror: number }>,
  firstCrackTime: number | null,
  dropTime: number | null,
): number {
  let score = 10;
  const issues = evaluateRoast(history, firstCrackTime, dropTime);
  issues.forEach(i => { score -= i.severity === "high" ? 1.5 : 0.8; });
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

export function scoreChallengeAccuracy(
  history: Array<{ time: number; bt: number }>,
  target: Array<{ time: number; bt: number }>,
): number {
  if (!history.length || !target.length) return 0;
  let totalError = 0, count = 0;
  for (const tp of target) {
    const actual = history.find(h => Math.abs(h.time - tp.time) <= 15);
    if (actual) { totalError += Math.abs(actual.bt - tp.bt); count++; }
  }
  if (!count) return 0;
  return Math.max(0, Math.round((1 - (totalError / count) / 30) * 100));
}
