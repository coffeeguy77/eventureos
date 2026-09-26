"use client";

import { useActionState, useState } from "react";
import { createOrganisation } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";

const TYPES = [
  "Mobile coffee & event catering", "Catering", "Mobile bar", "Venue", "Wedding services",
  "Event hire", "Corporate events", "Event planning", "Other",
];

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createOrganisation, undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const auto = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harbour Events Co" />
      </div>
      <div>
        <Label htmlFor="slug" hint="Letters, numbers and dashes">Workspace ID</Label>
        <div className="flex items-center rounded-lg border border-line-strong bg-white text-[13px] focus-within:ring-2 focus-within:ring-brand-100">
                    <input
            id="slug"
            name="slug"
            value={touched ? slug : auto}
            onChange={(e) => { setTouched(true); setSlug(e.target.value); }}
            className="w-full rounded-lg border-0 bg-white px-3 py-2 text-[13.5px] text-ink focus:outline-none"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="business_type">What kind of events do you run?</Label>
        <Select id="business_type" name="business_type" defaultValue="">
          <option value="">Choose one…</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </div>
      <FormError message={state?.error} />
      <Button variant="primary" className="h-11 w-full sm:h-9" disabled={pending}>{pending ? "Setting up…" : "Create organisation"}</Button>
    </form>
  );
}
