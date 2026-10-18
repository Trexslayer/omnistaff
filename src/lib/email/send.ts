import { Resend } from "resend";
import { LeaveNoticeEmail } from "@/emails/leave-notice";
import { EmployeeInvitationEmail } from "@/emails/employee-invitation";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export async function sendLeaveNotification(input: { to: string; subject: string; message: string }) {
  if (!resend || !process.env.EMAIL_FROM || !input.to) {
    // Local development should remain usable without email credentials.
    console.info("Email not sent (configure RESEND_API_KEY, EMAIL_FROM, and recipient):", input.subject);
    return { skipped: true };
  }
  return resend.emails.send({ from: process.env.EMAIL_FROM, to: input.to, subject: input.subject, react: LeaveNoticeEmail({ message: input.message }) });
}

export async function sendEmployeeInvitation(input: { to: string; companyName: string; firstName: string; inviteUrl: string }) {
  if (!resend || !process.env.EMAIL_FROM) {
    console.info("Invitation email not sent (configure RESEND_API_KEY and EMAIL_FROM):", input.to, input.inviteUrl);
    return { skipped: true };
  }
  return resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: input.to,
    subject: `Invitation to join ${input.companyName} on OmniStaff`,
    react: EmployeeInvitationEmail({ companyName: input.companyName, firstName: input.firstName, inviteUrl: input.inviteUrl }),
  });
}
