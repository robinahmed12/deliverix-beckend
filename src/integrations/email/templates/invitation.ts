export function invitationEmail(data: {
  inviterName: string;
  organizationName: string;
  invitationUrl: string;
  expiresIn: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `You've been invited to join ${data.organizationName}`,
    html: `
      <h2>You've been invited!</h2>
      <p><strong>${data.inviterName}</strong> has invited you to join <strong>${data.organizationName}</strong> as a staff member.</p>
      <p>Click the link below to set your password and activate your account:</p>
      <p><a href="${data.invitationUrl}">${data.invitationUrl}</a></p>
      <p>This invitation expires in ${data.expiresIn}.</p>
      <p>If you did not expect this invitation, you can safely ignore this email.</p>
    `,
    text: `You've been invited! ${data.inviterName} has invited you to join ${data.organizationName}. Visit: ${data.invitationUrl} (expires in ${data.expiresIn})`,
  };
}