import Link from "next/link";
import { LegalPage, OPERATOR } from "@/components/legal/legal-page";

export const metadata = { title: "Privacy Policy · EventureOS", description: "How EventureOS collects, uses, stores and protects personal information, including data from Google accounts." };

export default function PrivacyPage() {
  const mail = <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>;
  return (
    <LegalPage title="Privacy Policy" intro={<p>EventureOS is business software for event businesses — enquiries, quotes, bookings, invoices, rosters and the like. It is operated by {OPERATOR.legal} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what personal information EventureOS handles, why, who it is shared with, and the choices you have. We handle personal information in line with the Australian Privacy Principles in the Privacy Act 1988 (Cth).</p>}>
      <section>
        <h2>Who this covers</h2>
        <p><strong>Businesses that use EventureOS</strong> (&ldquo;customers&rdquo;) and the people who work for them. <strong>Their clients, guests, staff and suppliers</strong> whose details a business keeps in EventureOS — for that information the business decides what is collected and why, and we handle it on the business&apos;s behalf. If you are a client of a business that uses EventureOS, please contact that business first about your information; we will help them respond.</p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account details</strong> — name, email address, phone number, business name and role, and your sign-in details.</li>
          <li><strong>Business records you enter or import</strong> — customers and contacts, enquiries, events, quotes, invoices, payments, bookings, staff rosters, notes and files.</li>
          <li><strong>Information from services you connect</strong> — such as Google (Gmail and Google Calendar), Xero, Stripe and bank feeds. See &ldquo;Google user data&rdquo; below for exactly what is accessed from Google.</li>
          <li><strong>Payment information</strong> — card payments are processed by Stripe. We never see or store full card numbers.</li>
          <li><strong>Technical information</strong> — logs of activity in the app (who did what, and when), IP address and browser type, used for security and troubleshooting.</li>
          <li><strong>Cookies</strong> — only the cookies needed to keep you signed in, keep the app secure and remember settings. We do not use advertising or tracking cookies.</li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To provide EventureOS: show your records, send the quotes, invoices, emails and text messages you ask it to send, keep your calendar and accounting in step, and process payments.</li>
          <li>To provide optional AI features (see below) when you use them.</li>
          <li>To keep the service secure, prevent misuse, fix problems and support you.</li>
          <li>To tell you about changes to the service and your account. We do not send marketing on behalf of third parties.</li>
          <li>To meet legal obligations, such as tax and record-keeping.</li>
        </ul>
        <p>We do not sell personal information, and we do not use it for advertising.</p>
      </section>

      <section id="google">
        <h2>Google user data</h2>
        <p>A business can connect its Google account so EventureOS can work with its email and calendar. You choose to connect it, and you can disconnect it at any time.</p>
        <h3>What EventureOS accesses and why</h3>
        <ul>
          <li><strong>Gmail — read</strong> (<code>gmail.readonly</code>): to bring customer enquiries and the emails in those conversations into EventureOS, so they appear with the right customer, enquiry or job. Emails that aren&apos;t about the business&apos;s work are filtered out and not kept.</li>
          <li><strong>Gmail — send</strong> (<code>gmail.send</code>): to send the replies, quotes and invoices you write in EventureOS from your own Gmail address, in the same conversation.</li>
          <li><strong>Google Calendar — events</strong> (<code>calendar.events</code>): to show your jobs alongside your calendar, add booked jobs to it, and keep those entries up to date.</li>
          <li><strong>Google Calendar — calendar list</strong> (<code>calendar.calendarlist.readonly</code>): to let you choose which of your calendars EventureOS uses.</li>
        </ul>
        <h3>How it is stored and protected</h3>
        <p>Emails and calendar entries brought into EventureOS are stored in our database (hosted in Sydney, Australia), encrypted in transit and at rest, and kept separate for each business — only that business&apos;s signed-in team members can see them. The access tokens Google issues are stored where only our servers can read them; they are never sent to a browser.</p>
        <h3>AI features</h3>
        <p>If a business uses EventureOS&apos;s AI features, the text of the relevant email conversation is sent to our AI provider, Anthropic, to sort enquiries and draft or polish replies. Drafts are never sent without a person reviewing and sending them. Anthropic processes this data to return the result and, under its commercial terms, does not use it to train its models. Google user data is never used to develop, improve or train generalised AI or machine-learning models.</p>
        <h3>Sharing</h3>
        <p>Google user data is not sold, not used for advertising, and not shared with anyone except the service providers needed to run the features above (our database and hosting providers, and Anthropic for AI features), or where the law requires it. Our staff do not read it, except with the business&apos;s permission (for example, to help with a support request), where needed for security, or to comply with the law.</p>
        <h3>Limited Use</h3>
        <p>EventureOS&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
        <h3>Disconnecting and deleting</h3>
        <p>Disconnect Google in EventureOS under <strong>Settings → Integrations</strong>, or remove EventureOS&apos;s access at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>. Disconnecting deletes the stored access tokens and stops all access straight away. To have emails and calendar data already brought in deleted, email {mail} and we will delete it within 30 days.</p>
      </section>

      <section>
        <h2>Who we share information with</h2>
        <p>We use trusted service providers to run EventureOS. They may only use the information to provide their service to us:</p>
        <ul>
          <li><strong>Supabase</strong> — database and sign-in (data stored in Sydney, Australia)</li>
          <li><strong>Vercel</strong> — hosting of the app</li>
          <li><strong>Resend</strong> — sending emails such as quotes, invoices and notifications</li>
          <li><strong>Twilio</strong> — sending text messages</li>
          <li><strong>Stripe</strong> — card payments</li>
          <li><strong>Anthropic</strong> — AI features</li>
        </ul>
        <p>When a business connects other services — such as Xero, Google, Microsoft, Square, a bank feed provider or similar — information is exchanged with that service as the business directs, under that service&apos;s own privacy policy. We may also disclose information where required by law.</p>
        <p>Some of these providers store or process information outside Australia (for example in the United States). We choose providers that protect information to a standard comparable to the Australian Privacy Principles.</p>
      </section>

      <section>
        <h2>Security</h2>
        <p>Information is encrypted in transit and at rest. Each business&apos;s records are kept separate, and access inside a business is limited by role. Connection keys and tokens for other services are stored where only our servers can read them. No system is perfectly secure, but we work to protect your information and will notify affected people and the regulator of any eligible data breach as the law requires.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>We keep a business&apos;s information while it uses EventureOS. When a business closes its account, its information is deleted within 90 days, except records we must keep by law (such as tax records) and copies in backups, which expire on their normal cycle.</p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>You can ask to see or correct the personal information we hold about you, or ask us to delete it, by emailing {mail}. If your information is held by a business that uses EventureOS, we may refer your request to that business. If you are unhappy with how we handled your information, contact us first; you can also complain to the <a href="https://www.oaic.gov.au" target="_blank" rel="noopener">Office of the Australian Information Commissioner</a>.</p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>We will update this page when our practices change and change the date at the top. For significant changes we will let businesses know by email or in the app.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>{OPERATOR.legal}, {OPERATOR.place} · {mail}. See also our <Link href="/terms">Terms of Service</Link>.</p>
      </section>
    </LegalPage>
  );
}
