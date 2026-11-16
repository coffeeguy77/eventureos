/**
 * What a link may change. Applicant 1's (main) link can fill in everything except other applicants' consents.
 * Another applicant's link can change only their own answers. Consents (keys "aN.c_…") are always the person's own.
 */
export function mayAnswer(me: number, key: string): boolean {
  const m = /^a(\d)\.(.+)$/.exec(key);
  if (me === 1) return !(m && +m[1] !== 1 && m[2].startsWith("c_"));
  return !!m && +m[1] === me;
}
