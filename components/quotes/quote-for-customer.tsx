"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CustomerPicker, type PickerCustomer } from "@/components/customers/customer-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError, Input, Label } from "@/components/ui/form";
import { createQuoteForCustomer } from "@/app/(app)/quotes/actions";

/** New quote for a business without events: who it's for and what it's for, then straight into the quote builder. */
export function QuoteForCustomer({ customers, initialCustomer }: { customers: PickerCustomer[]; initialCustomer?: string }) {
  const [customerId, setCustomerId] = useState(initialCustomer ?? "");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setError(null);
    try {
      const r = await createQuoteForCustomer(customerId, title);
      if (r && !r.ok) setError(r.error);
    } catch (e) { unstable_rethrow(e); setError("Couldn't reach the server. Try again."); }
  });
  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div><Label htmlFor="q-customer">Customer</Label><CustomerPicker id="q-customer" customers={customers} value={customerId} onChange={setCustomerId} /></div>
      <div><Label htmlFor="q-title">What it&apos;s for</Label><Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Website redesign, Hosting renewal, Laptop repair"
        onKeyDown={(e) => { if (e.key === "Enter" && customerId && title.trim()) { e.preventDefault(); go(); } }} /></div>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button variant="primary" className="h-10 w-full sm:h-9 sm:w-auto" disabled={pending || !customerId || !title.trim()} onClick={go}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}Create quote
        </Button>
      </div>
    </Card>
  );
}
