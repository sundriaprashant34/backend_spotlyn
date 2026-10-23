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
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_FROM_EMAIL;

  if (!apiKey || apiKey === 'your_brevo_api_key_here' || !senderEmail) {
    console.warn('Brevo is not configured; first-login welcome email was skipped.');
    return false;
  }

  const appUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const name = escapeHtml(user.name);
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
      subject: 'Welcome to Spotlyn',
      htmlContent: `<html><body><p>Hi ${name},</p><p>Welcome to Spotlyn! Your student account is ready. You can now sign in and use the campus hub.</p><p><a href="${escapeHtml(appUrl)}">Open Spotlyn</a></p></body></html>`,
      textContent: `Hi ${user.name}, welcome to Spotlyn! Your student account is ready. Open Spotlyn: ${appUrl}`,
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Brevo returned HTTP ${response.status}: ${details}`);
  }

  return true;
}
