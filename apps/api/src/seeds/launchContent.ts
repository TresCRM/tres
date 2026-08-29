/**
 * Seed content for legal / policy pages.
 *
 * Usage:
 *   import { LAUNCH_CONTENT } from './launchContent';
 *   for (const doc of LAUNCH_CONTENT) {
 *     await Content.findOneAndUpdate({ slug: doc.slug }, doc, { upsert: true });
 *   }
 */

export const LAUNCH_CONTENT = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    type: "POLICY",
    body: `<h2>Information We Collect</h2>
<p>We collect information you provide directly when you create an account, submit support tickets, or interact with our services. This includes your name, email address, company name, and any content you submit through the platform. We also collect usage data automatically, including IP addresses, browser type, pages visited, and interaction timestamps, to improve our services and ensure platform security.</p>

<h2>How We Use Your Information</h2>
<p>Your information is used to provide and improve the TRES CRM platform, process support requests, send transactional emails (such as ticket updates and account notifications), and maintain system security. We may also use aggregated, anonymized data for analytics purposes. We do not sell your personal information to third parties.</p>

<h2>Data Retention and Security</h2>
<p>We retain your personal data for as long as your account is active or as needed to provide services. Support ticket data is retained according to your organization's configured retention policy. All data is encrypted in transit using TLS 1.2+ and sensitive fields are encrypted at rest. Passwords are hashed using Argon2 and are never stored in plaintext.</p>

<h2>Your Rights</h2>
<p>You have the right to access, correct, or delete your personal data at any time. You may export your data in a machine-readable format or request account deletion by contacting support. If you are located in the European Economic Area, you have additional rights under the GDPR, including the right to data portability and the right to lodge a complaint with a supervisory authority. To exercise any of these rights, contact us at privacy@tres-crm.com.</p>`,
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    type: "POLICY",
    body: `<h2>Acceptance of Terms</h2>
<p>By accessing or using the TRES CRM platform ("Service"), you agree to be bound by these Terms of Service. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these terms. If you do not agree to these terms, you may not access or use the Service.</p>

<h2>Use of the Service</h2>
<p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree not to use the Service for any unlawful purpose, to transmit malicious code, or to attempt to gain unauthorized access to any part of the Service. We reserve the right to suspend or terminate accounts that violate these terms or engage in abusive behavior.</p>

<h2>Subscription and Billing</h2>
<p>Paid features are available through subscription plans billed on a monthly or annual basis. All fees are non-refundable except where required by law. We may change pricing with 30 days' notice. If payment fails, your account will enter a grace period before being downgraded to the free tier. You may cancel your subscription at any time; access continues until the end of the current billing period.</p>

<h2>Limitation of Liability</h2>
<p>The Service is provided "as is" without warranties of any kind, express or implied. To the maximum extent permitted by law, TRES CRM shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability for any claim related to the Service shall not exceed the amount you paid for the Service in the twelve months preceding the claim. These limitations apply regardless of the form of action.</p>`,
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    type: "POLICY",
    body: `<h2>What Are Cookies</h2>
<p>Cookies are small text files stored on your device when you visit a website. We use cookies and similar technologies (such as local storage) to operate the TRES CRM platform, maintain your session, and remember your preferences. Without certain cookies, core functionality such as authentication would not work.</p>

<h2>Cookies We Use</h2>
<p>We use strictly necessary cookies to manage authentication sessions and CSRF protection. These cannot be disabled without breaking core functionality. We also use analytics cookies to understand how users interact with the platform, which helps us improve the user experience. Analytics data is aggregated and does not personally identify individual users. No third-party advertising cookies are used on the platform.</p>

<h2>Managing Cookies</h2>
<p>You can control cookies through your browser settings. Most browsers allow you to refuse cookies or delete them after they have been set. Please note that disabling strictly necessary cookies will prevent you from logging in and using the platform. For analytics cookies, you can opt out through the cookie consent banner displayed on your first visit.</p>

<h2>Updates to This Policy</h2>
<p>We may update this Cookie Policy from time to time to reflect changes in our practices or applicable regulations. When we make material changes, we will notify you through the platform or by email. The "last updated" date at the top of this page indicates when the policy was last revised. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>`,
  },
];
