/**
 * Brevo Transactional Email Service
 * 
 * Handles sending transactional emails (registration OTP and account confirmation)
 * using the Brevo REST API v3.
 * 
 * Clean, enterprise-grade transactional email templates with zero AI-slop emojis.
 */

const BREVO_API_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const DEFAULT_API_KEY = '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';
const DEFAULT_SENDER_EMAIL = 'siddocode@gmail.com';
const DEFAULT_SENDER_NAME = 'JobRadar';
const DEFAULT_APP_URL = (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true')
  ? 'https://job-radarr.vercel.app'
  : 'http://localhost:5173';

/**
 * Dispatches an email via Brevo REST API
 */
async function sendTransactionalEmail({ to, toName = '', subject, htmlContent, textContent }) {
  const apiKey = process.env.BREVO_API_KEY || DEFAULT_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || DEFAULT_SENDER_NAME;

  if (!apiKey) {
    throw new Error('Brevo API key is not configured.');
  }

  if (!to || !to.includes('@')) {
    throw new Error('A valid recipient email address is required.');
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail
    },
    to: [
      {
        email: to.trim().toLowerCase(),
        name: toName?.trim() || to.split('@')[0]
      }
    ],
    subject,
    htmlContent,
    textContent
  };

  const response = await fetch(BREVO_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let responseData = {};
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    const errorMsg = responseData?.message || responseData?.error || `Brevo API HTTP ${response.status}`;
    console.error(`[EmailService] Brevo dispatch error (${response.status}):`, errorMsg);
    throw new Error(`Email delivery failed: ${errorMsg}`);
  }

  console.log(`[EmailService] Email dispatched to ${to} (MessageId: ${responseData.messageId || 'ok'})`);
  return {
    success: true,
    messageId: responseData.messageId
  };
}

/**
 * Sends a 6-digit verification code OTP for registration
 * Minimalist, elegant design with concise copy.
 */
async function sendOtpEmail({ to, code, name = '' }) {
  const subject = `JobRadar code: ${code}`;

  const textContent = `Verify your email

Your single-use verification code is: ${code}

This code is valid for 10 minutes. If you did not request this code, you can safely ignore this email.

--
JobRadar • Direct Company Career Intelligence`;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 440px; background-color: #ffffff; border: 1px solid #eef2f6; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.04);">
          <!-- Top Accent Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #2563eb 0%, #06b6d4 100%);"></td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <!-- Minimal Brand Header -->
              <div style="margin-bottom: 24px;">
                <span style="font-size: 13px; font-weight: 800; letter-spacing: 2.5px; color: #0f172a; text-transform: uppercase;">JobRadar</span>
              </div>

              <!-- Headline -->
              <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.025em; line-height: 1.25;">
                Verify your email
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #64748b;">
                Enter this single-use code to complete your verification:
              </p>

              <!-- OTP Code Display Card -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px 16px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: 'SF Mono', 'Segoe UI Mono', 'Roboto Mono', Menlo, Consolas, Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f172a; display: inline-block; padding-left: 10px;">
                  ${code}
                </span>
                <div style="margin-top: 8px; font-size: 12px; font-weight: 500; color: #94a3b8;">
                  Valid for 10 minutes
                </div>
              </div>

              <!-- Quiet Security Note -->
              <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #94a3b8;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Minimal Footer -->
          <tr>
            <td style="padding: 16px 36px 24px 36px; border-top: 1px solid #f1f5f9; background-color: #ffffff;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                JobRadar &bull; Direct Company Career Intelligence
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendTransactionalEmail({
    to,
    toName: name,
    subject,
    htmlContent,
    textContent
  });
}

/**
 * Sends an account registration confirmation / welcome email
 * Concise, classy layout with feature pills.
 */
async function sendWelcomeEmail({ to, name = '' }) {
  const appUrl = process.env.APP_URL || DEFAULT_APP_URL;
  const subject = 'Welcome to JobRadar';
  const displayName = name?.trim() || to.split('@')[0];

  const textContent = `You're all set

Welcome, ${displayName}. Your JobRadar account is verified and ready.

What you can do:
- Company Directory: Direct access to verified company career portals
- Profile Matcher: Instant resume & skill compatibility checks
- Outreach Pipeline: Track recruiter contacts & applications

Open your workspace:
${appUrl}

--
JobRadar • Direct Company Career Intelligence`;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to JobRadar</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 460px; background-color: #ffffff; border: 1px solid #eef2f6; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.04);">
          <!-- Top Accent Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #2563eb 0%, #06b6d4 100%);"></td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 36px 36px 30px 36px;">
              <!-- Minimal Brand Header -->
              <div style="margin-bottom: 24px;">
                <span style="font-size: 13px; font-weight: 800; letter-spacing: 2.5px; color: #0f172a; text-transform: uppercase;">JobRadar</span>
              </div>

              <!-- Headline -->
              <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.025em; line-height: 1.25;">
                You're all set
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #64748b;">
                Welcome, <strong style="color: #0f172a;">${displayName}</strong>. Your account is verified and ready to use.
              </p>

              <!-- Feature Highlights Card -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 26px;">
                <div style="font-size: 13px; color: #334155; line-height: 1.6; padding-bottom: 10px; border-bottom: 1px solid #eef2f6;">
                  <strong style="color: #0f172a;">Company Directory</strong> &bull; Verified direct hiring portals
                </div>
                <div style="font-size: 13px; color: #334155; line-height: 1.6; padding: 10px 0; border-bottom: 1px solid #eef2f6;">
                  <strong style="color: #0f172a;">Profile Matcher</strong> &bull; Instant CV & skill fit analysis
                </div>
                <div style="font-size: 13px; color: #334155; line-height: 1.6; padding-top: 10px;">
                  <strong style="color: #0f172a;">Outreach Pipeline</strong> &bull; Track recruiter contacts & stages
                </div>
              </div>

              <!-- Primary CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="border-radius: 8px; background-color: #0f172a;">
                    <a href="${appUrl}" target="_blank" style="display: inline-block; padding: 12px 26px; font-size: 13.5px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      Open Workspace &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Quiet Security Note -->
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                If you didn't create this account, please disregard this email.
              </p>
            </td>
          </tr>

          <!-- Minimal Footer -->
          <tr>
            <td style="padding: 16px 36px 24px 36px; border-top: 1px solid #f1f5f9; background-color: #ffffff;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                JobRadar &bull; Direct Company Career Intelligence
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendTransactionalEmail({
    to,
    toName: displayName,
    subject,
    htmlContent,
    textContent
  });
}

module.exports = {
  sendTransactionalEmail,
  sendOtpEmail,
  sendWelcomeEmail
};
