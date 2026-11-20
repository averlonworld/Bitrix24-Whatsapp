import { Hono } from 'hono';
import { config } from '../../config.js';

/**
 * Licence agreement and privacy policy, as public English web pages (the Bitrix24 Market requires
 * both as browser-viewable links naming the app and the licensor). Company details come from the
 * environment; review the text with a lawyer before selling.
 */
export const legalRoutes = new Hono();

const EFFECTIVE = '16 November 2026';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

function legal() {
  const env = (k: string, d: string) => (process.env[k] || '').trim() || d;
  return {
    product: esc(env('LEGAL_PRODUCT_NAME', 'WhatsApp QR Connector for Bitrix24')),
    company: esc(env('LEGAL_COMPANY_NAME', '[Company name]')),
    email: esc(env('LEGAL_CONTACT_EMAIL', '[contact email]')),
    address: esc(env('LEGAL_ADDRESS', '[registered address]')),
    country: esc(env('LEGAL_GOVERNING_LAW', '[country]')),
    url: esc(config().publicUrl),
    mediaDays: config().mediaMaxAgeDays,
    trialDays: config().trialDays,
  };
}

function page(title: string, body: string): string {
  const L = legal();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${L.product}</title><style>
body{margin:0;background:#eef2f4;color:#333d47;font:15px/1.65 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif}
main{max-width:820px;margin:0 auto;padding:32px 20px 64px}
article{background:#fff;border:1px solid #e6eaed;border-radius:16px;padding:32px 36px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}h3{font-size:15px;margin:18px 0 6px}
.meta{color:#828b95;margin:0 0 20px}a{color:#2067b0}ul{padding-left:22px}li{margin:4px 0}
.note{background:#fff5e1;border-radius:10px;padding:12px 16px;color:#8a4b00}
nav{margin:0 0 16px;font-size:14px}nav a{margin-right:16px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #e6eaed;padding:8px;text-align:left;vertical-align:top}th{background:#f6f8f9}
@media (max-width:600px){article{padding:22px 18px}}
</style></head><body><main><nav><a href="/legal/terms">Licence Agreement</a><a href="/legal/privacy">Privacy Policy</a></nav>
<article>${body}</article></main></body></html>`;
}

legalRoutes.get('/legal', (c) => c.redirect('/legal/terms'));

legalRoutes.get('/legal/terms', (c) => {
  const L = legal();
  return c.html(
    page(
      'Licence Agreement',
      `<h1>Licence Agreement (Terms of Service)</h1>
<p class="meta">${L.product} &middot; Effective ${EFFECTIVE}</p>
<p>This Licence Agreement ("Agreement") is between <b>${L.company}</b>, ${L.address} ("Licensor", "we", "us") and the organisation that installs
<b>${L.product}</b> (the "Application") in its Bitrix24 account ("Customer", "you"). By installing or using the Application you accept this
Agreement on behalf of your organisation. If you do not accept it, do not install or use the Application.</p>

<h2>1. What the Application does</h2>
<p>The Application connects WhatsApp accounts that you link by QR code (as a "linked device", like WhatsApp Web) to your Bitrix24 account:
Contact Center Open Lines, CRM records, automation rules and the SMS provider. It is provided as a hosted service ("Software as a Service")
operated by us at ${L.url}.</p>

<h2>2. Not affiliated with WhatsApp or Meta</h2>
<p class="note"><b>Important.</b> The Application is an independent product. It is <b>not</b> affiliated with, endorsed or sponsored by
WhatsApp LLC, Meta Platforms, Inc. or Bitrix24. "WhatsApp" is a trademark of its owner and is used only to describe compatibility.
The Application does not use the official WhatsApp Business Platform. It connects as a linked device using an unofficial protocol.
WhatsApp's own terms may not allow this, and WhatsApp may restrict, suspend or ban a phone number, or change its service so that the
Application stops working, at any time and without notice. <b>You use the Application with your WhatsApp accounts at your own risk.</b>
We are not responsible for any restriction or ban of your numbers or for interruptions caused by WhatsApp.</p>

<h2>3. Licence</h2>
<p>Subject to this Agreement and to payment of the applicable fees, we grant you a non-exclusive, non-transferable, revocable right for your
organisation's employees to use the Application in the Bitrix24 account in which it is installed, during the trial or a paid subscription.
You may not resell, sublicense, copy, reverse-engineer, or use the Application to build a competing service, except as permitted by law.</p>

<h2>4. Trial, subscription and payment</h2>
<ul>
<li><b>Free trial:</b> ${L.trialDays} days from the first installation in a Bitrix24 account, with a limited number of WhatsApp numbers.</li>
<li><b>Subscription:</b> after the trial, the Application is billed monthly in advance, per linked WhatsApp number, at the price shown at checkout.
Payments are processed by Stripe, Inc.; we do not receive or store your card details.</li>
<li><b>Renewal:</b> subscriptions renew automatically each month until cancelled. You can cancel at any time in the Application (Billing) or the
Stripe customer portal; cancellation takes effect at the end of the current billing period.</li>
<li><b>Changes in quantity:</b> adding or removing numbers is prorated by Stripe on the next invoice.</li>
<li><b>Refunds:</b> fees already paid are non-refundable, except where required by law.</li>
<li><b>Non-payment:</b> if a payment fails and is not resolved, sending through the Application is paused until payment is made.</li>
<li><b>Taxes:</b> prices exclude taxes unless stated; you are responsible for any applicable taxes.</li>
<li><b>Price changes:</b> we may change prices with at least 30 days' notice; changes apply from the next billing period.</li>
</ul>

<h2>5. Acceptable use</h2>
<p>You must use the Application lawfully and in line with WhatsApp's terms and policies as far as they apply to you. In particular you must not:</p>
<ul>
<li>send spam, bulk or unsolicited messages, or messages to people who have not agreed to be contacted;</li>
<li>send unlawful, fraudulent, harassing, infringing or harmful content;</li>
<li>process personal data without a lawful basis, or contrary to data-protection law;</li>
<li>attempt to disrupt, overload or gain unauthorised access to the Application or other customers' data.</li>
</ul>
<p>We may suspend access immediately if we reasonably believe these rules are broken, or to protect the service or other customers.</p>

<h2>6. Your data and responsibilities</h2>
<p>You remain the owner of, and responsible for, the content and personal data that pass through the Application (messages, contacts, files).
For that data you act as data controller and we act as your data processor, as described in our <a href="/legal/privacy">Privacy Policy</a>.
You are responsible for informing the people you communicate with and for having a lawful basis to contact them. You are responsible for
the security of your Bitrix24 account and for who in your organisation may use the Application.</p>

<h2>7. Service availability and support</h2>
<p>We aim to keep the Application available and to fix problems promptly, but we do not guarantee uninterrupted or error-free operation.
Maintenance, WhatsApp or Bitrix24 changes, and events outside our control may cause interruptions. Support: <a href="mailto:${L.email}">${L.email}</a>.</p>

<h2>8. Uninstalling and data deletion</h2>
<p>You can uninstall the Application at any time. If you choose "Clear application data" when uninstalling, the linked WhatsApp devices are
unlinked and all data stored for your Bitrix24 account is deleted immediately. Otherwise it is kept for 30 days so that a reinstall can resume
without new QR scans, and is deleted after that. Backups are overwritten within 14 days. Uninstalling also ends billing at the end of the period.</p>

<h2>9. Disclaimer of warranties</h2>
<p>To the maximum extent permitted by law, the Application is provided "as is" and "as available", without warranties of any kind, express or
implied, including merchantability, fitness for a particular purpose and non-infringement.</p>

<h2>10. Limitation of liability</h2>
<p>To the maximum extent permitted by law, we are not liable for indirect, incidental, special or consequential damages, loss of profits,
revenue, data or business, or for any ban or restriction of WhatsApp numbers. Our total liability for any claim relating to the Application is
limited to the fees you paid us for the Application in the 3 months before the event giving rise to the claim. Nothing in this Agreement limits
liability that cannot be limited by law.</p>

<h2>11. Indemnity</h2>
<p>You will indemnify us against claims by third parties arising from your content, your messages or your breach of this Agreement or of law.</p>

<h2>12. Term and termination</h2>
<p>This Agreement applies while the Application is installed in your Bitrix24 account. Either party may end it at any time; you by uninstalling
or cancelling, we with 30 days' notice, or immediately for a material breach. Sections 2, 6 and 9 to 14 survive termination.</p>

<h2>13. Changes to this Agreement</h2>
<p>We may update this Agreement. Material changes will be announced in the Application or by email at least 30 days before they take effect.
Continued use after that date means you accept the updated Agreement.</p>

<h2>14. Governing law</h2>
<p>This Agreement is governed by the laws of ${L.country}, without regard to conflict-of-law rules. The courts of ${L.country} have jurisdiction,
unless mandatory consumer or local law provides otherwise.</p>

<h2>15. Contact</h2>
<p>${L.company}, ${L.address}. Email: <a href="mailto:${L.email}">${L.email}</a>.</p>`,
    ),
  );
});

legalRoutes.get('/legal/privacy', (c) => {
  const L = legal();
  return c.html(
    page(
      'Privacy Policy',
      `<h1>Privacy Policy</h1>
<p class="meta">${L.product} &middot; Effective ${EFFECTIVE}</p>
<p>This policy explains how <b>${L.company}</b>, ${L.address} ("we") processes personal data when organisations use <b>${L.product}</b>
(the "Application") with their Bitrix24 account. The organisation that installs the Application ("Customer") decides why and how its messages and
contacts are processed: for that data the Customer is the <b>controller</b> and we are its <b>processor</b>. For account and billing data of the
Customer and its administrators we are the controller.</p>

<h2>1. What we process</h2>
<table>
<tr><th>Data</th><th>Purpose</th><th>Kept for</th></tr>
<tr><td>Bitrix24 account identifiers (member id, domain, REST address) and OAuth tokens (encrypted, AES-256-GCM)</td><td>Connecting the Application to the Bitrix24 account</td><td>While installed; deleted on uninstall (see section 4)</td></tr>
<tr><td>WhatsApp linked-device keys of each linked number (encrypted, AES-256-GCM) and the number itself</td><td>Keeping the WhatsApp connection alive without new QR scans</td><td>Until the number is logged out or deleted, or the Application is uninstalled</td></tr>
<tr><td>Contacts' phone numbers, WhatsApp display names and profile photos, and the link between each WhatsApp chat and its Bitrix24 chat</td><td>Delivering conversations to the right Open Line chat and CRM record</td><td>While installed</td></tr>
<tr><td>Message content and attachments</td><td>Passing messages between WhatsApp and Bitrix24</td><td>Message text is <b>not</b> stored in our database. It passes through a processing queue and is removed within 1 hour after delivery (failed deliveries: up to 7 days). Attachments are stored temporarily so Bitrix24 can fetch them and are deleted after ${L.mediaDays} days. The conversation itself is stored by Bitrix24 in the Customer's account.</td></tr>
<tr><td>Message metadata (ids, direction, delivery status, time; no text)</td><td>Avoiding duplicates, delivery and read receipts, statistics</td><td>While installed</td></tr>
<tr><td>Employees who open the Application (Bitrix24 user id, name, administrator flag)</td><td>Permissions, the team view and disconnect alerts</td><td>While installed</td></tr>
<tr><td>Activity log: which employee (Bitrix24 user id and name) linked, removed or changed a number or a setting, when, and from which IP address; connection events from WhatsApp; billing events. No message content.</td><td>Accountability and security for the Customer's administrators</td><td>12 months, then deleted automatically</td></tr>
<tr><td>Billing: Stripe customer and subscription ids, plan status and quantity</td><td>Charging for the subscription</td><td>While installed and as required by tax law. Card details are handled only by Stripe.</td></tr>
<tr><td>Technical logs (Bitrix24 API method names, errors and timing; server events). Logs never contain tokens or message text.</td><td>Security, troubleshooting, Bitrix24 Market requirements</td><td>API log 7 days; server logs are rotated</td></tr>
</table>

<h2>2. Legal bases</h2>
<p>For the Customer's account and billing data: performance of our contract and our legitimate interests in running a secure service, and
legal obligations (for example tax records). Message and contact data is processed on the Customer's instructions; the Customer is responsible
for having a lawful basis to contact the people it messages.</p>

<h2>3. Who receives data (sub-processors)</h2>
<ul>
<li><b>Hosting provider</b> of our servers, where the data above is stored.</li>
<li><b>Cloudflare, Inc.</b>: secure network tunnel and HTTPS between Bitrix24, users and our servers.</li>
<li><b>Stripe, Inc.</b>: payment processing and invoicing.</li>
<li><b>WhatsApp / Meta</b>: messages are sent and received through the WhatsApp network as for any WhatsApp device.</li>
<li><b>Bitrix24</b>: the Customer's own Bitrix24 account, where conversations and CRM data are stored.</li>
</ul>
<p>We do not sell personal data and do not use message content for advertising or to train models.</p>

<h2>4. Retention and deletion</h2>
<p>When the Application is uninstalled with "Clear application data", the linked WhatsApp devices are unlinked and all data we store for that
Bitrix24 account is deleted immediately. Without that option, the data is kept for 30 days (so a reinstall can resume without new QR scans) and
then deleted automatically. Database backups are kept for 14 days and then overwritten. A Customer can also ask us to delete its data at any time.</p>

<h2>5. Security</h2>
<p>Tokens and WhatsApp keys are encrypted at rest. All connections use HTTPS. Each request from Bitrix24 is verified with Bitrix24's OAuth
server or the application token. Only Bitrix24 administrators can link or manage company numbers; employees can manage only their own number.
Access to the servers is restricted to authorised staff.</p>

<h2>6. International transfers</h2>
<p>Data may be processed in countries other than yours, including where our hosting provider, Cloudflare and Stripe operate. Where required,
we rely on appropriate safeguards such as the European Commission's Standard Contractual Clauses.</p>

<h2>7. Your rights</h2>
<p>Depending on where you live, you may have the right to access, correct, delete or export your personal data, to object to or restrict
processing, and to complain to a data-protection authority. If your data is processed on behalf of a Customer (for example, you are a customer of
a company that uses the Application), please contact that company first; we will help it respond. To exercise your rights, email
<a href="mailto:${L.email}">${L.email}</a>.</p>

<h2>8. Data processing agreement</h2>
<p>Customers that need a data processing agreement (for example under the GDPR) can request one at <a href="mailto:${L.email}">${L.email}</a>.</p>

<h2>9. Children</h2>
<p>The Application is a business tool and is not directed to children.</p>

<h2>10. Changes</h2>
<p>We may update this policy. The effective date above shows the latest version; material changes will be announced in the Application.</p>

<h2>11. Contact</h2>
<p>${L.company}, ${L.address}. Email: <a href="mailto:${L.email}">${L.email}</a>.</p>`,
    ),
  );
});
