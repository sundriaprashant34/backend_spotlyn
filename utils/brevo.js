export async function sendFirstLoginWelcomeEmail(user) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_FROM_EMAIL || process.env.ADMIN_EMAIL || 'noreply@spotlyn.local';

  if (!apiKey) {
    console.warn('BREVO_API_KEY is not set. Skipping first-login email.');
    return { sent: false, reason: 'Missing BREVO_API_KEY' };
  }

  const payload = {
    sender: {
      name: process.env.BREVO_FROM_NAME || 'Spotlyn',
      email: senderEmail,
    },
    to: [
      {
        email: user.email,
        name: user.name,
      },
    ],
    subject: 'Welcome to Spotlyn',
    htmlContent: `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111827; margin-bottom: 16px;">Welcome, ${user.name}!</h2>
            <p>Your Spotlyn account has been successfully created.</p>
            <p>You can now log in and start using the platform.</p>
            <p style="margin-top: 20px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" style="background: #2563eb; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 8px; display: inline-block;">
                Go to Spotlyn
              </a>
            </p>
          </div>
        </body>
      </html>
    `,
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = await response.text();
    console.warn('Brevo email send failed:', result);
    return { sent: false, reason: result };
  }

  return { sent: true };
}
