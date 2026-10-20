# Learn — the online barista course

Moved from the Replit app "Barista Course" (October 2026). Admin: **Learn** in the menu (`/learn`). Learners: `/academy/<business>`.

## Turning it on
1. Run `supabase/migrations/0063_learn.sql` in Supabase → SQL editor.
2. Learn → Lessons → **Import the course** (127 lessons, 39 modules, 9 levels, 44 knowledge checks, 9 badges, 5 daily challenges, the trainer manual).
3. Learn → Plans & pricing: check prices, tick which courses offer the add-on, then switch **Selling** on.
4. Optional: set `ANTHROPIC_API_KEY` in Vercel for the AI coach (already used elsewhere in EventureOS).
5. Optional: Learn → Training rooms → open the marketplace.

Everything ships switched **off**. No customer emails are sent unless "welcome email" is ticked.

## What moved
| Replit app | EventureOS |
|---|---|
| Levels, modules, lessons, knowledge checks (beanCulture.ts LEVELS/MODULES/LESSONS) | `learn_levels`, `learn_modules`, `learn_lessons` — editable in Learn → Lessons |
| Mastery quizzes (built from each module's lesson questions) | same rule, 80% to pass, module XP once |
| XP, ranks (level min_xp), streaks | `learn_learners`; XP via `learn_complete_lesson` / `learn_add_xp` |
| Badges (BADGES) | `learn_badges` with a rule each (lessons, streak, level, roast score, challenges, art score, module in a day) |
| Certifications c1–c6, Looking for Work, Home Barista | certificate per finished level (printable) |
| Daily challenges (CHALLENGES) | one a day for everyone, self-reported, XP once a day |
| Leaderboard | top 25 by XP; learners can rename or hide themselves |
| Roast simulator (data/roastSimEngine.ts) | `lib/learn/roast-sim.ts` copied as-is; saved roasts give up to 20 XP once a day |
| AI coach + photo analysis (OpenAI gpt-5.4 / gpt-4o) | Claude via the Messages API, same prompts and coach styles; daily limits per learner |
| Trainer curriculum, 4hr/2hr timelines, theory test, rubrics | `learn_trainer_items`, read in Learn → Trainer manual |
| Membership plans (Solo $14.99/mo) | three plans (below) |
| Venue partners / training rooms | room-hire marketplace with a commission (below) |

Not moved (say if you want them): Staff Connect (overlaps the EventureOS job board), team/enterprise plans and "my team", trainer assessment scoring workflow, the venue self-service portal and its $264/yr listing fee, QR check-in / student ID, phone sign-in, app-store purchases, the 17 translations, the demo sample roasts.

## Prices (suggested, all editable)
Based on the Replit app's Solo plan of $14.99 a month:
- **Monthly** $14.99 — card saved, charged each month by the daily job; cancel any time (access runs to the end of the month). Three failed charges and it stops.
- **Yearly** $149.90 — 10 × monthly, i.e. **2 months free**. Paid once for 12 months.
- **With a barista course** $74.95 — **50% off yearly**. A tick-box on the course booking page, paid in the same card payment. Also available on the learner site to anyone booked on an eligible course (and for N days after the class if you set "past student days").

Other options worth considering: price "with a course" as a flat add-on that's easy to say at the counter (e.g. $69 or $79); a cheaper 3-month pass for job-seekers on the 4-hour course; bundle the course into the class price for the Professional course only; a free month for past students to win them back.

## Training-room marketplace
Venues list a room (free) from the learner site → you approve it → people ask to hire it → you confirm the price → EventureOS works out your commission (default 15%; the Replit app used 15–20%) → copy the pay link to the hirer → they pay you by card → you pay the venue its share and tick "venue paid". You hold the money and pass it on ("collect and remit").

Alternatives: charge venues a yearly listing fee instead of (or as well as) commission (Replit app: $264/yr); or Stripe Connect so the venue is paid directly and only your cut lands with you (more set-up for each venue).
