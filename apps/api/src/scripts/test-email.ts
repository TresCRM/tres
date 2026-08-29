/**
 * CLI script to test email delivery.
 *
 * Usage:
 *   npx ts-node apps/api/src/scripts/test-email.ts <recipient>
 *   npx ts-node apps/api/src/scripts/test-email.ts info@tres-crm.com
 *
 * Set SMTP_PROVIDER=trescrm in .env to use the tres-crm.com mail server.
 * Set SMTP_PROVIDER=default (or omit) to use MailHog/localhost.
 *
 * The script will:
 *  1. Show which SMTP provider is configured
 *  2. Send a test email
 *  3. Report success or failure with details
 */
import "dotenv/config";

// Override EMAILS_DISABLED for this script
process.env.EMAILS_DISABLED = "0";
process.env.NODE_ENV = "development";

async function main() {
  const to = process.argv[2];

  if (!to) {
    console.error("Usage: npx ts-node apps/api/src/scripts/test-email.ts <recipient-email>");
    console.error("Example: npx ts-node apps/api/src/scripts/test-email.ts info@tres-crm.com");
    process.exit(1);
  }

  const provider = process.env.SMTP_PROVIDER || "default";

  console.log("╔══════════════════════════════════════════╗");
  console.log("║     TRES CRM — Email Delivery Test       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Provider:  ${provider}`);

  if (provider === "trescrm") {
    console.log(`  Host:      ${process.env.SMTP_TRESCRM_HOST || "mail.tres-crm.com"}`);
    console.log(`  Port:      ${process.env.SMTP_TRESCRM_PORT || 465}`);
    console.log(`  User:      ${process.env.SMTP_TRESCRM_USER || "(not set)"}`);
    console.log(`  Secure:    ${process.env.SMTP_TRESCRM_SECURE === "1" ? "TLS" : "no"}`);
    console.log(`  From:      ${process.env.SMTP_TRESCRM_FROM || "info@tres-crm.com"}`);
  } else {
    console.log(`  Host:      ${process.env.SMTP_HOST || "localhost"}`);
    console.log(`  Port:      ${process.env.SMTP_PORT || 1025}`);
    console.log(`  User:      ${process.env.SMTP_USER || "(none)"}`);
    console.log(`  Secure:    ${process.env.SMTP_SECURE === "1" ? "TLS" : "no"}`);
    console.log(`  From:      ${process.env.FROM_EMAIL || "no-reply@trescrm.local"}`);
  }

  console.log(`  To:        ${to}`);
  console.log();
  console.log("  Sending...");

  const { sendTestEmail } = await import("../services/mailer");
  const result = await sendTestEmail(to);

  console.log();
  if (result.success) {
    console.log("  ✓ Email sent successfully!");
    console.log(`  Message-ID: ${result.messageId}`);
  } else {
    console.log("  ✗ Email delivery failed!");
    console.log(`  Error: ${result.error}`);
    console.log();
    console.log("  Troubleshooting:");
    if (provider === "trescrm") {
      console.log("    1. Check SMTP_TRESCRM_PASS is set in .env");
      console.log("    2. Verify mail.tres-crm.com is reachable: telnet mail.tres-crm.com 465");
      console.log("    3. Ensure the password is correct for info@tres-crm.com");
    } else {
      console.log("    1. Is MailHog running? docker compose up -d");
      console.log("    2. Check SMTP_HOST and SMTP_PORT in .env");
    }
  }

  console.log();
  process.exit(result.success ? 0 : 1);
}

main();
