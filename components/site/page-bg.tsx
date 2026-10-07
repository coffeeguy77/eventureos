/**
 * Paints the whole browser canvas in the page's bottom colour, so there's never a band of a different colour
 * below a short page (or when a full-page screenshot stretches the window).
 */
export function PageBg({ color }: { color: string }) {
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) return null;
  return <style>{`html,body{background:${color}}`}</style>;
}
