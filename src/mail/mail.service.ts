import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private log = new Logger('MailService');
  private from = process.env.MAIL_FROM || 'JBN GATI <no-reply@gati.app>';
  private tx = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === '465',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  private async send(to: string, subject: string, html: string) {
    if (!this.tx) { this.log.warn(`[MAIL not configured] would send "${subject}" to ${to}`); return; }
    await this.tx.sendMail({ from: this.from, to, subject, html });
  }

  sendOtp(to: string, code: string) {
    return this.send(to, 'Your GATI login code',
      `<p>Your one-time login code is <b style="font-size:20px">${code}</b>. It expires in 5 minutes.</p>`);
  }

  sendWelcome(to: string, name: string, tempPassword: string, profileUrl: string) {
    return this.send(to, 'Welcome to JBN GATI — your profile is live',
      `<p>Namaste ${name},</p>
       <p>Your JITO Business Network (GATI) profile is ready:</p>
       <p><a href="${profileUrl}">${profileUrl}</a></p>
       <p>Log in with this email and the temporary password below, then change it:</p>
       <p>Temporary password: <b>${tempPassword}</b></p>
       <p>— JBN GATI, Meerut</p>`);
  }
}
