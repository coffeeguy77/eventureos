"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { createLoanFile } from "@/app/(app)/loans/actions";

/** Add a client: name, contact, how many applicants — they get a link to fill in the rest. */
export function NewLoanFile() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ contact_name: "", contact_email: "", contact_phone: "", applicants: 1, loan_type: "", amount: "", title: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  if (!open) return <Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New client</Button>;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center" role="dialog" aria-modal aria-label="New loan client">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-[1.125rem] font-semibold text-ink">New client</h2>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="lf-name">Client name</Label><Input id="lf-name" value={f.contact_name} onChange={(e) => set({ contact_name: e.target.value })} placeholder="e.g. Jane Citizen" /></div>
          <div><Label htmlFor="lf-email">Email</Label><Input id="lf-email" type="email" value={f.contact_email} onChange={(e) => set({ contact_email: e.target.value })} /></div>
          <div><Label htmlFor="lf-phone">Mobile</Label><Input id="lf-phone" type="tel" value={f.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></div>
          <div><Label htmlFor="lf-app">Applicants</Label>
            <Select id="lf-app" value={String(f.applicants)} onChange={(e) => set({ applicants: Number(e.target.value) })}>
              <option value="1">One person</option><option value="2">Two (joint)</option><option value="3">Three</option><option value="4">Four</option>
            </Select></div>
          <div><Label htmlFor="lf-type">Loan type</Label>
            <Select id="lf-type" value={f.loan_type} onChange={(e) => set({ loan_type: e.target.value })}>
              <option value="">Not sure yet</option>{["Home loan", "Investment loan", "Refinance", "Equity release", "Business loan", "Car / equipment", "Other"].map((o) => <option key={o}>{o}</option>)}
            </Select></div>
          <div><Label htmlFor="lf-amt" hint="optional">Amount</Label><Input id="lf-amt" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="$" /></div>
          <div><Label htmlFor="lf-title" hint="optional">File name</Label><Input id="lf-title" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Name — loan application" /></div>
        </div>
        <p className="mt-3 text-[0.75rem] text-ink-muted">The usual documents list is added for you (ID, tax, payslips, statements, rates, rental) — change it on the file.</p>
        <FormError message={err} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={() => start(async () => {
            setErr(null);
            const r = await createLoanFile(f);
            if (!r.ok) { setErr(r.error); return; }
            router.push(`/loans/${r.data.id}`);
          })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Create and get the link</Button>
        </div>
      </div>
    </div>
  );
}
