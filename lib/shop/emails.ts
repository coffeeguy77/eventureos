import { shell, type Brand, type Btn } from "@/lib/bookings/emails";

/** Shop emails use the same branded layout as booking emails. */
export function shopEmail(b: Brand, o: { heading: string; intro: string[]; rows?: { label: string; value: string }[]; buttons?: Btn[]; after?: string[]; big?: string; badge?: string }) {
  return shell(b, { title: o.heading, ...o });
}
