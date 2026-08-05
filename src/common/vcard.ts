// Builds a vCard 3.0 string so any phone can "Save to contacts" from a tap.
// Kept framework-free so it is unit-testable on its own.

import { randomInt } from 'crypto';

export interface VCardInput {
  name: string;
  company?: string | null;
  title?: string | null; // business category shown as role
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  photoUrl?: string | null;
  note?: string | null;
}

function esc(v: string): string {
  // vCard escaping: backslash, comma, semicolon, newline
  return v.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

export function buildVCard(i: VCardInput): string {
  const parts = i.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const first = parts[0] || i.name;

  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${esc(last)};${esc(first)};;;`);
  lines.push(`FN:${esc(i.name)}`);
  if (i.company) lines.push(`ORG:${esc(i.company)}`);
  if (i.title) lines.push(`TITLE:${esc(i.title)}`);
  if (i.phone) lines.push(`TEL;TYPE=CELL,VOICE:${esc(i.phone)}`);
  if (i.whatsapp && i.whatsapp !== i.phone) lines.push(`TEL;TYPE=CELL:${esc(i.whatsapp)}`);
  if (i.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(i.email)}`);
  if (i.website) lines.push(`URL:${esc(i.website)}`);
  if (i.photoUrl) lines.push(`PHOTO;VALUE=URI:${esc(i.photoUrl)}`);
  lines.push(`NOTE:${esc(i.note || 'JBN GATI · Meerut member')}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Card tokens are random, URL-safe, and not guessable (cards are physical objects). Uses
// crypto.randomInt (CSPRNG-backed), not Math.random() — the same guarantee the QR attendance
// tokens already have (meetings.service.ts), just keeping this one's human-readable alphabet.
export function newCardToken(): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let t = '';
  for (let n = 0; n < 10; n++) t += abc[randomInt(0, abc.length)];
  return `GATI-${t.slice(0, 5)}-${t.slice(5)}`;
}
