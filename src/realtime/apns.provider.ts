import { Injectable, Logger } from '@nestjs/common';
import * as apn from '@parse/node-apn';

// Real push delivery to a fully closed/killed app — everything else in this feature (the
// RealtimeGateway socket) only reaches an app that's open or briefly backgrounded. Inactive by
// default: it needs an Apple Developer Program Auth Key (.p8), which nothing in this codebase can
// generate — set APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID/APNS_PRIVATE_KEY in .env to activate it.
// Until then this silently no-ops so the rest of the notification system is unaffected.
@Injectable()
export class ApnsService {
  private readonly logger = new Logger(ApnsService.name);
  private provider: apn.Provider | null = null;
  private warnedOnce = false;

  get available(): boolean {
    return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID && process.env.APNS_PRIVATE_KEY);
  }

  private getProvider(): apn.Provider | null {
    if (!this.available) {
      if (!this.warnedOnce) {
        this.warnedOnce = true;
        this.logger.warn('APNS_* env vars not set — killed-app push notifications are disabled (live in-app updates still work).');
      }
      return null;
    }
    if (!this.provider) {
      this.provider = new apn.Provider({
        token: {
          key: process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, '\n'),
          keyId: process.env.APNS_KEY_ID!,
          teamId: process.env.APNS_TEAM_ID!,
        },
        production: process.env.APNS_PRODUCTION === 'true',
      });
    }
    return this.provider;
  }

  // Best-effort — a failed push must never break the mutation that triggered it.
  async push(deviceToken: string, title: string, body?: string, meta?: Record<string, unknown>): Promise<void> {
    const provider = this.getProvider();
    if (!provider) return;
    try {
      const note = new apn.Notification();
      note.alert = { title, body: body || '' };
      note.sound = 'default';
      note.topic = process.env.APNS_BUNDLE_ID!;
      note.payload = meta || {};
      const result = await provider.send(note, deviceToken);
      for (const f of result.failed) {
        this.logger.warn(`APNs push failed for a device token: ${f.response?.reason || f.error?.message}`);
      }
    } catch (e) {
      this.logger.warn(`APNs push threw: ${(e as Error).message}`);
    }
  }
}
