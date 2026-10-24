import { FlaskConical } from "lucide-react";

/** Shown on a customer page when it belongs to a test checkout (the test code). */
export function TestBanner({ what = "This" }: { what?: string }) {
  return (
    <p className="mx-auto mb-6 flex max-w-xl items-start gap-2.5 rounded-2xl bg-[#FFF4E5] px-4 py-3 text-[0.9063rem] text-[#7A4A12] ring-1 ring-[#F6DFC3]" role="note">
      <FlaskConical className="mt-0.5 h-[18px] w-[18px] shrink-0" />
      <span><strong>Test only.</strong> {what} was made with the test code — it isn&apos;t real, isn&apos;t counted anywhere and will be cleared from Settings → Testing.</span>
    </p>
  );
}
