import "dotenv/config";
import { sendVerificationEmail } from "../services/mailer";

(async () => {
  try {
    console.log("Sending verification email...");
    console.log("SMTP_PROVIDER:", process.env.SMTP_PROVIDER);
    console.log("EMAILS_DISABLED:", process.env.EMAILS_DISABLED);
    console.log("NODE_ENV:", process.env.NODE_ENV);
    await sendVerificationEmail(
      "proffnick1@gmail.com",
      "testmail-debug",
      "abc123tokenxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "482901"
    );
    console.log("Done - email sent successfully");
  } catch (e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
})();
