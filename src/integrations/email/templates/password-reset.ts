export function passwordResetEmail(data: {
  resetUrl: string;
  expiresIn: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: "Reset your password",
    html: `
      <h2>Password Reset</h2>
      <p>You requested a password reset for your Deliverix account.</p>
      <p>Click the link below to set a new password:</p>
      <p><a href="${data.resetUrl}">${data.resetUrl}</a></p>
      <p>This link expires in ${data.expiresIn}.</p>
      <p>If you did not request this, you can safely ignore this email. Your password will not change until you click the link and set a new one.</p>
    `,
    text: `Password reset requested. Visit: ${data.resetUrl} (expires in ${data.expiresIn}). If you did not request this, ignore this email.`,
  };
}