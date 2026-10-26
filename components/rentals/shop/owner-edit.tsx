"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { pageEditAccess } from "@/app/site-edit-actions";

/** A small "Edit" button for the business's owners, admins and managers (visitors never see it). */
export function OwnerEdit({ slug, href, label }: { slug: string; href: string; label: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => { let live = true; pageEditAccess(slug).then((r) => live && setOk(!!r)).catch(() => undefined); return () => { live = false; }; }, [slug]);
  if (!ok) return null;
  return (
    <a href={href} className="fixed bottom-24 right-4 z-50 flex h-11 items-center gap-2 rounded-full bg-zinc-900 px-4 text-[0.875rem] font-semibold text-white shadow-lg hover:bg-black lg:bottom-6">
      <Pencil className="h-4 w-4" />{label}
    </a>
  );
}
