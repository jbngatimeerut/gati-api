import { BadRequestException } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { randomBytes } from 'crypto';

// Shared by every upload endpoint (members, admin, ads). Two things make this safe against the
// "upload a .html file with a <script> tag, get it served back as text/html" stored-XSS path:
// (1) the accepted type is decided by the real file bytes (magic-byte signature), never by the
// client-supplied filename or Content-Type header, and (2) the saved extension is always one we
// picked from that signature match, never anything derived from client input.
const IMAGE_SIGNATURES: { ext: string; check: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', check: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', check: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'gif', check: (b) => b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { ext: 'webp', check: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

// MP4/MOV/M4V all use the ISO base media file format: a 4-byte size, then the ASCII tag "ftyp" at
// offset 4. WebM is a Matroska/EBML container with a fixed 4-byte magic number.
const VIDEO_SIGNATURES: { ext: string; check: (b: Buffer) => boolean }[] = [
  { ext: 'mp4', check: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' },
  { ext: 'webm', check: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 8MB — images/logos
// A 30s 4K (2160p) H.264/H.265 clip realistically tops out well under this even at a generous
// bitrate; this is a hard ceiling against abuse, not a target file size.
export const VIDEO_MAX_BYTES = 250 * 1024 * 1024; // 250MB — video ad creatives
export const AD_VIDEO_MAX_SECONDS = 30;

export function saveUploadedImage(file: { buffer?: Buffer } | undefined): { url: string } {
  if (!file?.buffer) throw new BadRequestException('No file');
  if (file.buffer.length > UPLOAD_MAX_BYTES) throw new BadRequestException('File too large (max 8MB)');
  const match = IMAGE_SIGNATURES.find((s) => s.check(file.buffer!));
  if (!match) throw new BadRequestException('Only JPEG, PNG, GIF, or WEBP images are allowed');
  return writeUpload(file.buffer, match.ext);
}

// Accepts either an image or a video in one field (an ad's primary creative can be either) —
// still sniffed by magic bytes only, never trusting the client's filename/Content-Type.
export function saveUploadedMedia(file: { buffer?: Buffer } | undefined): { url: string; kind: 'image' | 'video' } {
  if (!file?.buffer) throw new BadRequestException('No file');
  const image = IMAGE_SIGNATURES.find((s) => s.check(file.buffer!));
  if (image) {
    if (file.buffer.length > UPLOAD_MAX_BYTES) throw new BadRequestException('Image too large (max 8MB)');
    return { ...writeUpload(file.buffer, image.ext), kind: 'image' };
  }
  const video = VIDEO_SIGNATURES.find((s) => s.check(file.buffer!));
  if (video) {
    if (file.buffer.length > VIDEO_MAX_BYTES) throw new BadRequestException('Video too large (max 250MB)');
    checkVideoDuration(file.buffer, video.ext);
    return { ...writeUpload(file.buffer, video.ext), kind: 'video' };
  }
  throw new BadRequestException('Only JPEG, PNG, GIF, WEBP images or MP4/WEBM videos are allowed');
}

// Best-effort duration check via ffprobe, if it's installed on the host. If ffprobe is missing
// this degrades to "accepted without a server-side duration check" rather than failing every
// upload — the client already enforces the 30s cap before recording/picking, this is defense in
// depth, not the only gate.
function checkVideoDuration(buffer: Buffer, ext: string) {
  const tmpPath = join('/tmp', `probe-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`);
  try {
    writeFileSync(tmpPath, buffer);
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', tmpPath], { timeout: 5000 }).toString().trim();
    const seconds = parseFloat(out);
    if (Number.isFinite(seconds) && seconds > AD_VIDEO_MAX_SECONDS + 1) {
      throw new BadRequestException(`Video must be ${AD_VIDEO_MAX_SECONDS} seconds or shorter (this one is ${Math.round(seconds)}s)`);
    }
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    // ffprobe not installed / failed to parse — skip the duration check rather than block uploads.
  } finally {
    try { require('fs').unlinkSync(tmpPath); } catch {}
  }
}

function writeUpload(buffer: Buffer, ext: string): { url: string } {
  const name = `up-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  const dir = join(process.cwd(), 'uploads');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), buffer);
  return { url: `/api/uploads/${name}` };
}
