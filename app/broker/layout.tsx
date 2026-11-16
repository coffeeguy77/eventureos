export const metadata = { title: "Broker portal", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default function BrokerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-ink">{children}</div>;
}
