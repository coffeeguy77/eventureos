/**
 * Who gets a Nerd Herd ticket email. Pure — used by alertStaff and tests.
 *  1. Assigned (the ticket, or an open part of it): only those people.
 *  2. Nobody assigned, opened by a team member by hand: only them (you made it, it's yours until you hand it on).
 *  3. Nobody assigned otherwise (an email, the client page, someone who never gets ticket emails): the default person.
 *  Never: the person who did the thing, or anyone on the "never email about tickets" list.
 */
export function ticketAlertRecipients(o: {
  assignees: (string | null | undefined)[]; createdBy: string | null; source: string | null;
  defaultAssignee: string | null; quiet: readonly string[]; actor?: string | null;
}): string[] {
  const quiet = new Set(o.quiet);
  let ids = [...new Set(o.assignees.filter((x): x is string => !!x))];
  if (!ids.length) {
    if (o.createdBy && o.source === "manual" && !quiet.has(o.createdBy)) ids = [o.createdBy];
    else if (o.defaultAssignee) ids = [o.defaultAssignee];
  }
  return ids.filter((id) => !quiet.has(id) && id !== o.actor);
}
