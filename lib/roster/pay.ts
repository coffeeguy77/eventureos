import { awardHours, estimateCost, flatHours, workedHours, type AwardRules, type DayHours, type EmploymentType, type Worked } from "./award";

/** One person's hours by category: the award split, or all ordinary for someone on an agreed flat rate. */
export function hoursFor(worked: Worked[], p: { type: EmploymentType; flat: boolean }, holidays: Set<string>, rules: AwardRules): Map<string, DayHours> {
  return p.flat ? flatHours(worked) : awardHours(worked, p.type, holidays, rules);
}

export function totalsFor(byDay: Map<string, DayHours>, p: { type: EmploymentType; flat: boolean; rate: number }, rules: AwardRules) {
  const hours = Math.round([...byDay.values()].reduce((t, h) => t + workedHours(h, rules), 0) * 100) / 100;
  const cost = p.flat ? Math.round(hours * p.rate * 100) / 100 : estimateCost(byDay, p.type, p.rate, rules);
  return { hours, cost };
}
