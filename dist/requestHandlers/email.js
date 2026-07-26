"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const resend_1 = require("resend");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
router.post("/email/send", async (req, res) => {
    const { to, subject, title, message } = req.body;
    if (!to || !subject || !title || !message) {
        return res.status(400).json({
            error: "Missing required fields: to, subject, title, message",
        });
    }
    try {
        await sendEmail({ to, subject, title, message });
        res.status(200).json({ message: "Email sent successfully" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to send email" });
    }
});
const sendEmail = async ({ to, subject, title, message }) => {
    const response = await resend.emails.send({
        from: "Grilla Smash <noreply@grillasmash.com>",
        to,
        subject,
        html: buildEmailContent({ title, message }),
    });
    console.log("Email sent:", response);
    return response;
};
const buildEmailContent = ({ title, message }) => `
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
  .footer a { color: #111; text-decoration: none; font-weight: 700; }
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
        <div class="logo">Grill'a Smash</div>
      </div>
      <div class="content">
        <div class="status-pill">${title}</div>
        <div class="message">
          ${message.split("\n").map(line => `<p>${line}</p>`).join("")}
        </div>
      </div>
      <div class="footer">
        <p>Thanks for ordering with Grill'a Smash.</p>
        <p>If you need help, give our store a call.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
exports.default = router;
