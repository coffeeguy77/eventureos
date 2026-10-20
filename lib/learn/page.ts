import "server-only";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { currentStudent } from "@/lib/bookings/student-auth";
import { learnerState, learnOrg, learnReady, loadCurriculum, type Curriculum, type LearnerState, type LearnOrg } from "./server";
import type { Student } from "@/lib/bookings/student-auth";

export interface AcademyCtx { org: LearnOrg; me: Student | null; state: LearnerState | null; c: Curriculum; ready: boolean }

/** Everything an academy page needs: the business, the signed-in learner (if any) and the course. */
export async function academy(slug: string): Promise<AcademyCtx> {
  const db = createServiceClient();
  const org = await learnOrg(slug, db);
  if (!org) notFound();
  const ready = await learnReady(db);
  if (!ready) return { org, me: null, state: null, c: { levels: [], modules: [], lessons: [] }, ready };
  const [me, c] = await Promise.all([currentStudent(org).catch(() => null), loadCurriculum(db, org.id)]);
  const state = me ? await learnerState(db, org, me.id).catch(() => null) : null;
  return { org, me, state, c, ready };
}
