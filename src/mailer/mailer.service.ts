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
    await this.tx.sendMail({ from: process.env.MAIL_FROM || 'GATI <no-reply@jito.app>', to, subject, html });
  }

  sendOtp(to: string, code: string) {
    return this.send(to, 'Your GATI login code',
      `<p>Your one-time login code is <b style="font-size:20px">${code}</b>. It expires in 5 minutes.</p>`);
  }

  sendWelcome(to: string, name: string, tempPassword: string, profileUrl: string) {
    return this.send(to, 'Welcome to JITO GATI — your profile is live',
      `<p>Namaste ${name},</p>
       <p>Your JBN GATI profile is live: <a href="${profileUrl}">${profileUrl}</a></p>
       <p>Sign in with this email and a temporary password: <b>${tempPassword}</b><br/>
       Please change it after your first login.</p>
       <p>— JITO Business Network</p>`);
  }
}
