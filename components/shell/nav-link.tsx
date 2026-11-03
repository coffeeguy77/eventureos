"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A menu link that only prefetches when you show intent (hover, focus, touch) — not every link the moment the menu
 * is on screen. With ~20 menu items, viewport prefetching made every page view fire ~20 extra server renders
 * (each checking the session and loading the business), which is what was slowing the whole app down.
 */
export function NavLink({ href, onMouseEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const warm = () => { try { router.prefetch(href); } catch { /* fine */ } };
  return (
    <Link href={href} prefetch={false}
      onMouseEnter={(e) => { warm(); onMouseEnter?.(e); }}
      onFocus={(e) => { warm(); onFocus?.(e); }}
      onTouchStart={(e) => { warm(); onTouchStart?.(e); }}
      {...rest} />
  );
}
