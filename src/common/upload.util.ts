import { BadRequestException } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

// Shared by every upload endpoint (members, admin). Two things make this safe against the
// "upload a .html file with a <script> tag, get it served back as text/html" stored-XSS path:
// (1) the accepted type is decided by the real file bytes (magic-byte signature), never by the
// client-supplied filename or Content-Type header, and (2) the saved extension is always one we
// picked from that signature match, never anything derived from client input.
const SIGNATURES: { ext: string; check: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', check: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', check: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'gif', check: (b) => b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { ext: 'webp', check: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 8MB

export function saveUploadedImage(file: { buffer?: Buffer } | undefined): { url: string } {
  if (!file?.buffer) throw new BadRequestException('No file');
  if (file.buffer.length > UPLOAD_MAX_BYTES) throw new BadRequestException('File too large (max 8MB)');
  const match = SIGNATURES.find((s) => s.check(file.buffer!));
  if (!match) throw new BadRequestException('Only JPEG, PNG, GIF, or WEBP images are allowed');
  const name = `up-${Date.now()}-${randomBytes(6).toString('hex')}.${match.ext}`;
  const dir = join(process.cwd(), 'uploads');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), file.buffer);
  return { url: `/api/uploads/${name}` };
}
