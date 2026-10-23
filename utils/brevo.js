const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });

export async function sendFirstLoginWelcomeEmail(user) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const missingConfiguration = [];

  if (!apiKey || /^(your_|replace_|<)/i.test(apiKey))
    missingConfiguration.push('BREVO_API_KEY');
  if (
    !senderEmail ||
    /^(your_|replace_|<)/i.test(senderEmail) ||
    /@example\.(com|org|net)$/i.test(senderEmail)
  )
    missingConfiguration.push('BREVO_FROM_EMAIL');

  if (missingConfiguration.length) {
    console.warn(
      `Brevo is not configured (${missingConfiguration.join(', ')}); first-login welcome email was skipped.`
    );
    return false;
  }

  const appUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const name = escapeHtml(user.name);
  const htmlContent = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Welcome to Spotlyn</title>
      </head>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
          Your Spotlyn student account is ready. Sign in to get started.
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;">
                <tr>
                  <td style="background:#1d4ed8;padding:32px 36px;color:#ffffff;">
                    <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#dbeafe;">College Campus Hub</div>
                    <div style="font-size:32px;font-weight:bold;margin-top:10px;">Spotlyn</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:36px;">
                    <p style="margin:0 0 16px;font-size:18px;">Hi ${name},</p>
                    <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;color:#0f172a;">Welcome to your Spotlyn account!</h1>
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#475569;">
                      Your student account is ready. Spotlyn helps you report campus issues, follow complaint updates, and manage lost and found items—all in one place.
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
                      <tr>
                        <td style="border-radius:10px;background:#2563eb;">
                          <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;">Open my Spotlyn account</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">
                      If the button doesn't work, copy and paste this link into your browser:<br>
                      <a href="${escapeHtml(appUrl)}" style="color:#2563eb;overflow-wrap:anywhere;">${escapeHtml(appUrl)}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid #e2e8f0;padding:22px 36px;background:#f8fafc;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                      This email was sent because a Spotlyn student account signed in for the first time. Please do not share your password with anyone.
                    </p>
                    <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">© Spotlyn · College Campus Hub</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
  const textContent = [
    `Hi ${user.name},`,
    '',
    'Welcome to your Spotlyn account!',
    'Your student account is ready. Spotlyn helps you report campus issues, follow complaint updates, and manage lost and found items.',
    '',
    `Open your Spotlyn account: ${appUrl}`,
    '',
    'Please do not share your password with anyone.',
    '© Spotlyn · College Campus Hub',
  ].join('\n');

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_FROM_NAME || 'Spotlyn',
        email: senderEmail,
      },
      to: [{ email: user.email, name: user.name }],
      subject: 'Welcome to your Spotlyn account!',
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Brevo returned HTTP ${response.status}: ${details}`);
  }

  console.info('Brevo accepted a first-login welcome email.');
  return true;
}
