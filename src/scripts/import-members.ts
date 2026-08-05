/**
 * One-time bulk onboarding from your Excel/CSV export.
 *   npm run import:members -- ./members.xlsx <chapterSlug>
 */
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';

const prisma = new PrismaClient();
const mailer = new MailerService();

const norm = (h: string) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
function val(row: Record<string, any>, test: (n: string) => boolean): string {
  const key = Object.keys(row).find((k) => test(norm(k)));
  return key ? String(row[key] ?? '').trim() : '';
}
const slugify = (n: string) => n.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
// CSPRNG-backed (crypto.randomInt), not Math.random() — these become real login credentials and
// physical-card tokens, same reasoning as common/vcard.ts's newCardToken().
function tempPwd() { return 'Gati@' + randomInt(1000, 10000) + Array.from({ length: 2 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[randomInt(0, 36)]).join(''); }
function cardToken() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let t = ''; for (let i = 0; i < 10; i++) t += a[randomInt(0, a.length)]; return `GATI-${t.slice(0, 5)}-${t.slice(5)}`; }
function jito(v: string) { const n = norm(v); if (n.includes('patron')) return 'PATRON'; if (n.includes('fcp')) return 'FCP'; if (n.includes('cp')) return 'CP'; return 'NONE'; }

// Phone -> clean +91 number
function cleanPhone(raw: string): string {
  let d = String(raw).replace(/\.0$/, '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.length === 10) return '+91' + d;
  if (d.length === 12 && d.startsWith('91')) return '+' + d;
  if (d.length === 11 && d.startsWith('0')) return '+91' + d.slice(1);
  return '+' + d;
}

// Google Drive share link -> a link that actually displays as an image
function driveImg(url: string): string {
  if (!url) return '';
  url = url.trim();
  const m = url.match(/\/d\/([A-Za-z0-9_-]+)/) || url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return url;
}
function driveImgList(s: string): string {
  return s.split(/[\s,]+/).filter(Boolean).map(driveImg).join(',');
}
function website(w: string): string {
  if (!w) return '';
  return w.startsWith('http') ? w : 'https://' + w.replace(/^\/+/, '');
}

async function main() {
  const file = process.argv[2] || './members.xlsx';
  const chapterSlug = process.argv[3] || 'meerut';
  const base = (process.env.WEB_ORIGIN || 'https://gati.app').split(',')[0];

  const chapter = await prisma.chapter.findUnique({ where: { slug: chapterSlug } });
  if (!chapter) throw new Error(`Chapter "${chapterSlug}" not found — run db:seed first.`);

  const wb = XLSX.readFile(file);
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`Read ${rows.length} rows from ${file}`);

  const creds: string[] = ['name,email,tempPassword,profileUrl,cardToken'];
  let created = 0, skipped = 0;

  for (const row of rows) {
    const name = val(row, (n) => n.includes('name') && !n.includes('business') && !n.includes('brand')).replace(/\s+/g, ' ').trim();
    const email = val(row, (n) => n.includes('email')).toLowerCase();
    if (!name || !email || !email.includes('@')) { skipped++; continue; }
    if (await prisma.member.findUnique({ where: { email } })) { skipped++; continue; }

    const phone = cleanPhone(val(row, (n) => n.includes('mobile') || n.includes('whatsapp') || n.includes('phone')));
    const company = val(row, (n) => n.includes('businessname'));
    const brandName = val(row, (n) => n.includes('brand'));
    const address = val(row, (n) => n.includes('address'));
    const about = val(row, (n) => n.includes('describe')) || (address ? `Located at ${address}.` : '');
    let category = val(row, (n) => n.includes('category') && !n.includes('sub') && !n.includes('others'));
    const ifOthers = val(row, (n) => n.includes('others') && n.includes('category'));
    if (!category || /other/i.test(category)) category = ifOthers || category;
    const subCategory = val(row, (n) => n.includes('subcategory'));
    const photoUrl = driveImg(val(row, (n) => n.includes('photograph')));
    const productImages = driveImgList(val(row, (n) => n.includes('product') && n.includes('image')));

    let slug = slugify(name) || 'member';
    while (await prisma.member.findUnique({ where: { slug } })) slug += '-' + Math.random().toString(36).slice(2, 4);

    const pwd = tempPwd();
    const member = await prisma.member.create({
      data: {
        chapterId: chapter.id, name, slug, email, role: 'MEMBER',
        phone: phone || null, whatsapp: phone || null, company: company || null,
        brandName: brandName || null, category: category || null, subCategory: subCategory || null,
        about: about || null, website: website(val(row, (n) => n.includes('website'))) || null,
        photoUrl: photoUrl || null, productImages: productImages || null,
        jitoMembership: jito(val(row, (n) => n.includes('jito'))) as any,
        verified: true,
        passwordHash: await bcrypt.hash(pwd, 10),
      },
    });
    const token = cardToken();
    await prisma.nfcCard.create({ data: { memberId: member.id, token, status: 'ACTIVE', issuedAt: new Date(), batchRef: 'BULK-IMPORT' } });

    const profileUrl = `${base}/m/${slug}`;
    try { await mailer.sendWelcome(email, name, pwd, profileUrl); } catch {}
    creds.push(`"${name}",${email},${pwd},${profileUrl},${token}`);
    created++;
    console.log(`  ✓ ${name} → ${profileUrl}`);
  }

  fs.writeFileSync('./onboarding-credentials.csv', creds.join('\n'));
  console.log(`\nDone. Created ${created}, skipped ${skipped}. Credentials saved to onboarding-credentials.csv`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
