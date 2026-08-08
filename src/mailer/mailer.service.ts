import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private log = new Logger('Mailer');
  private tx = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  private async send(to: string, subject: string, html: string) {
    if (!this.tx) { this.log.warn(`[no SMTP] would email ${to}: ${subject}`); return; }
    await this.tx.sendMail({ from: process.env.MAIL_FROM || 'JBN Gati <no-reply@jito.app>', to, subject, html });
  }

  sendOtp(to: string, code: string) {
    return this.send(to, 'Your JBN Gati verification code',
      `<p>Please use the verification code below to sign in to your JBN Gati account.</p>
       <p style="font-size:24px;font-weight:bold;letter-spacing:2px">${code}</p>
       <p>This code will expire in 5 minutes. If you did not request this, you can safely ignore this email.</p>
       <p>Regards,<br/>JBN Gati</p>`);
  }

  sendWelcome(to: string, name: string, tempPassword: string, profileUrl: string) {
    return this.send(to, 'Welcome to JBN Gati — your profile is now live',
      `<p>Dear ${name},</p>
       <p>Your JBN Gati profile is now live: <a href="${profileUrl}">${profileUrl}</a></p>
       <p>You may sign in using this email address and the temporary password below. For security, please change it after your first login.</p>
       <p>Temporary password: <b>${tempPassword}</b></p>
       <p>Regards,<br/>JBN Gati</p>`);
  }
}
