import { Resend } from "resend";

let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const FROM = "Flow State CRM <noreply@resend.dev>";

export async function sendInviteAcceptedEmail(
  to: string,
  staffEmail: string,
  gymName: string,
): Promise<void> {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${staffEmail} has joined ${gymName} on Flow State`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#0d1b2a;margin-bottom:8px">A staff member has joined!</h2>
        <p style="color:#555;margin-bottom:24px">
          <strong>${staffEmail}</strong> has accepted their invite and joined
          <strong>${gymName}</strong> on Flow State CRM.
        </p>
        <p style="color:#999;font-size:12px;margin-top:24px">
          You can manage your team on the Team page of your gym dashboard.
        </p>
      </div>
    `,
  });
}

export async function sendInviteEmail(
  to: string,
  gymName: string,
  inviterName: string,
  token: string,
  appUrl: string,
): Promise<void> {
  // Must be an actual route the web app handles (AcceptInvitePage lives at
  // /accept-invite and reads ?token=), and must exactly match the path
  // registered in the mobile app's associatedDomains/intentFilters
  // (see app.json) so the universal/app link fires. Falls back to this
  // web page automatically when the native app isn't installed.
  const link = `${appUrl}/accept-invite?token=${token}`;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `You've been invited to join ${gymName} on Flow State`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#0d1b2a;margin-bottom:8px">You're invited!</h2>
        <p style="color:#555;margin-bottom:24px">
          <strong>${inviterName}</strong> has invited you to join
          <strong>${gymName}</strong> on Flow State CRM.
          Click the button below to set up your account. This invite expires in 48 hours.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#00c8f0;color:#0d1b2a;font-weight:600;
                  padding:14px 28px;border-radius:8px;text-decoration:none">
          Accept Invite
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
