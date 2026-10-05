import "server-only";
import { notFound, redirect } from "next/navigation";
import { currentEmployer, jobsOrg } from "./server";

/** For employer-only pages: signed in and approved, or back to the employer start page. */
export async function approvedEmployer(slug: string) {
  const org = await jobsOrg(slug);
  if (!org || !org.jobs.enabled) notFound();
  const emp = await currentEmployer(org).catch(() => null);
  if (!emp || emp.status !== "approved") redirect(`/jobs/${slug}/employers`);
  return { org, emp };
}
