import Link from "next/link";
import { LegalPage, OPERATOR } from "@/components/legal/legal-page";

export const metadata = { title: "Terms of Service", description: "The terms for using EventureOS." };

export default function TermsPage() {
  const mail = <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>;
  return (
    <LegalPage title="Terms of Service" intro={<p>These terms apply to your use of EventureOS, which is provided by {OPERATOR.legal} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using EventureOS you agree to them on behalf of yourself and the business you use it for (&ldquo;you&rdquo;).</p>}>
      <section>
        <h2>1. The service</h2>
        <p>EventureOS is online software for running an event business: enquiries, quotes, bookings, events, invoices, payments, rosters and related tools, and connections to other services such as Google, Xero and Stripe. We may improve and change features over time. If we remove something important you rely on, we will give reasonable notice.</p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>You must give accurate details and keep your sign-in secure. You are responsible for what happens under your account and the accounts of the team members you invite.</li>
          <li>Tell us straight away at {mail} if you think your account has been misused.</li>
          <li>You must be able to enter into a binding agreement for your business.</li>
        </ul>
      </section>

      <section>
        <h2>3. Your data</h2>
        <ul>
          <li>You own the information you put into EventureOS. You let us store, process and display it only so we can provide the service to you, as described in our <Link href="/privacy">Privacy Policy</Link>.</li>
          <li>You are responsible for having the right to collect and use the personal information you store — for example your clients&apos; and staff details — and for telling them how you use it.</li>
          <li>You can export your information, and when you close your account it is deleted as set out in the Privacy Policy.</li>
        </ul>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>You must not use EventureOS to break the law or anyone&apos;s rights; to send spam or messages that breach the Spam Act 2003 (Cth) — marketing messages need consent and an unsubscribe option; to upload malicious code; to try to access other businesses&apos; data; or to overload, probe or reverse-engineer the service. We may suspend access that puts the service or other customers at risk.</p>
      </section>

      <section>
        <h2>5. Connected services</h2>
        <p>When you connect another service (such as Google, Xero, Stripe or a bank feed), you authorise EventureOS to exchange information with it on your behalf, and that service&apos;s own terms also apply. You can disconnect at any time. We aren&apos;t responsible for other services&apos; availability or changes they make.</p>
      </section>

      <section>
        <h2>6. AI features</h2>
        <p>Some features use AI to sort enquiries, draft replies, price quotes or suggest changes. AI output can be wrong. Nothing is sent to your clients without a person choosing to send it, and you are responsible for checking what you send. Some features you switch on can act automatically — for example sending matched bank transactions to your accounting software — and you can switch them off at any time.</p>
      </section>

      <section>
        <h2>7. Fees</h2>
        <p>Fees for your plan are shown when you sign up or in your account and are payable in advance unless agreed otherwise. Prices include GST where it applies. We will give at least 30 days&apos; notice of a price change. Fees your clients pay you (such as card payments through Stripe) are between you, your client and the payment provider.</p>
      </section>

      <section>
        <h2>8. Availability and support</h2>
        <p>We work to keep EventureOS available and your data backed up, but we can&apos;t promise it will always be uninterrupted or error-free. We may carry out maintenance, ideally outside business hours. Contact us at {mail} for help.</p>
      </section>

      <section>
        <h2>9. Liability</h2>
        <p>Nothing in these terms excludes rights you have under the Australian Consumer Law that can&apos;t be excluded. To the extent the law allows, we are not liable for indirect or consequential loss (such as lost profits or lost business), and our total liability to you is limited to the fees you paid us in the 12 months before the claim. Where the law allows us to limit our liability for a failure to meet a consumer guarantee, it is limited to supplying the service again or paying for it to be supplied again.</p>
      </section>

      <section>
        <h2>10. Ending your use</h2>
        <p>You can stop using EventureOS and close your account at any time. We may suspend or close an account for serious or repeated breaches of these terms or non-payment, after giving notice where reasonable. Before closing, you can export your information.</p>
      </section>

      <section>
        <h2>11. Changes to these terms</h2>
        <p>We may update these terms. We will change the date at the top and, for significant changes, let you know by email or in the app at least 14 days before they apply. Continuing to use EventureOS after that means you accept the changes.</p>
      </section>

      <section>
        <h2>12. General</h2>
        <p>These terms are governed by the laws in force in Australia. If part of these terms is unenforceable, the rest still applies. Contact: {OPERATOR.legal}, {OPERATOR.place} · {mail}.</p>
      </section>
    </LegalPage>
  );
}
