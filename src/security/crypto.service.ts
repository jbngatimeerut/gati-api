import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

interface Envelope { iv: string; data: string; tag: string }

// Fresh RSA-2048 keypair per process start — clients re-handshake after a restart, which is
// cheap and automatic. A static/embedded key would be extractable from the client binary/bundle
// and add no real security beyond TLS; per-session AES keys negotiated via this keypair do.
@Injectable()
export class CryptoService {
  private readonly keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly sessions = new Map<string, Buffer>();

  get publicKeyDer() {
    return {
      // Web Crypto's importKey only accepts SPKI for RSA-OAEP public keys.
      spkiDer: this.keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      // iOS SecKeyCreateWithData wants the raw PKCS1 RSAPublicKey structure, not SPKI.
      pkcs1Der: this.keyPair.publicKey.export({ type: 'pkcs1', format: 'der' }).toString('base64'),
    };
  }

  handshake(sessionId: string, encryptedAesKeyB64: string) {
    const aesKey = crypto.privateDecrypt(
      { key: this.keyPair.privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(encryptedAesKeyB64, 'base64'),
    );
    this.sessions.set(sessionId, aesKey);
  }

  hasSession(sessionId: string | undefined | null): sessionId is string {
    return !!sessionId && this.sessions.has(sessionId);
  }

  decrypt(sessionId: string, envelope: Envelope): any {
    const key = this.sessions.get(sessionId)!;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  }

  encrypt(sessionId: string, value: unknown): Envelope {
    const key = this.sessions.get(sessionId)!;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value ?? null), 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), data: data.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  }
}
