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

export async function sendRegistrationOtpEmail({ email, name, code }) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_FROM_EMAIL?.trim();
  if (
    !apiKey ||
    /^(your_|replace_|<)/i.test(apiKey) ||
    !senderEmail ||
    /^(your_|replace_|<)/i.test(senderEmail) ||
    /@example\.(com|org|net)$/i.test(senderEmail)
  ) {
    const error = new Error(
      'Registration email verification requires BREVO_API_KEY and a verified BREVO_FROM_EMAIL.'
    );
    error.code = 'MAIL_CONFIGURATION';
    throw error;
  }

  const safeName = escapeHtml(name);
  const htmlContent = `
    <p>Hi ${safeName},</p>
    <p>Your Spotlyn verification code is:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p>
    <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
  `;
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
      to: [{ email, name }],
      subject: 'Verify your Spotlyn account',
      htmlContent,
      textContent: `Hi ${name}, your Spotlyn verification code is ${code}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    let providerResponse;
    try {
      providerResponse = JSON.parse(details);
    } catch {
      providerResponse = null;
    }
    const ipAuthorizationRequired =
      response.status === 401 && providerResponse?.code === 'unauthorized';
    const error = new Error(`Brevo returned HTTP ${response.status}: ${details}`);
    error.code = ipAuthorizationRequired ? 'MAIL_IP_NOT_AUTHORIZED' : 'MAIL_PROVIDER';
    throw error;
  }

  const result = await response.json();
  console.info('Brevo accepted a registration OTP email.', {
    messageId: result.messageId || 'not provided',
  });
}
