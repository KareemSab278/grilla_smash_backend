/*
    EMAIL - SENDS TRANSACTIONAL EMAIL THROUGH RESEND.

    Backend only: there is deliberately no HTTP route for this, an open send endpoint would let anyone
    send mail from the business domain. Handlers call sendEmail() directly (order updates, password resets).
    Resend reports failures in the result instead of throwing, so sendEmail() turns them into a thrown Error.
*/

import { Resend } from "resend";
import { CONFIG } from "../config";

const BRAND_NAME = CONFIG.businessName;

const resend = new Resend(CONFIG.resendApiKey);

export type EmailParams = {
    to: string;
    subject: string;
    title: string;
    message: string;
};

const escapeHtml = (value: string): string =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

export const sendEmail = async ({ to, subject, title, message }: EmailParams): Promise<void> => {
    const { error } = await resend.emails.send({
        from: CONFIG.emailFrom,
        to,
        subject,
        html: buildEmailContent({ title, message }),
    });

    if (error) throw new Error(`Failed to send email: ${error.message}`);
};

export const buildEmailContent = ({ title, message }: Pick<EmailParams, "title" | "message">): string => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #222; }
  .wrapper { width: 100%; padding: 24px 0; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,0.12); }
  .header { background: #111111; color: #ffffff; padding: 28px 30px; text-align: center; }
  .logo { font-size: 22px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
  .content { padding: 30px; }
  .status-pill { display: inline-block; padding: 10px 18px; border-radius: 999px; background: #ff7a00; color: #fff; font-weight: 500; font-size: 28px; margin-bottom: 18px; margin-left: auto; margin-right: auto; text-align: center; }
  .message { font-size: 16px; line-height: 1.75; color: #444; }
  .message p { margin: 0 0 16px; }
  .footer { padding: 24px 30px 30px; background: #fafafa; color: #666; font-size: 14px; text-align: center; }
  @media (max-width: 620px) {
    .container { border-radius: 0; }
    .content, .header, .footer { padding: 20px; }
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">${BRAND_NAME}</div>
      </div>
      <div class="content">
        <div class="status-pill">${escapeHtml(title)}</div>
        <div class="message">
          ${message.split("\n").map(line => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
      </div>
      <div class="footer">
        <p>Thanks for choosing ${BRAND_NAME}.</p>
        <p>If you need help, give our store a call.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
