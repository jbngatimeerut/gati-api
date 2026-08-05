/**
 * One-time: copy a small, named set of real members from production into UAT for realistic
 * role/permission testing — without ever giving UAT standing access to prod's database.
 *
 * The prod connection string is passed as a one-off CLI argument, never stored in UAT's env.
 * Real email addresses are kept as-is (OTP needs to actually reach them); phone numbers are
 * replaced with a placeholder and every copied account gets one shared, known test password.
 * Nothing else (referrals, payments, messages, notifications) is copied — these are fresh
 * accounts in an otherwise-empty UAT database, not a data mirror.
 *
 *   npm run export:uat-sample -- "<prod DATABASE_URL>" "<comma-separated emails>" "<test password>"
 *
 * Run this from inside the UAT api container so the destination (ambient DATABASE_URL) is UAT's:
 *   docker compose -f docker-compose.uat.yml exec api \
 *     npm run export:uat-sample -- "postgresql://..." "a@x.com,b@x.com" "Uat@Test2026"
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

async function main() {
  const [prodUrl, emailsArg, testPassword] = process.argv.slice(2);
  if (!prodUrl || !emailsArg || !testPassword) {
    throw new Error('Usage: export-uat-sample.ts "<prod DATABASE_URL>" "<emails,comma,separated>" "<test password>"');
  }
  const emails = emailsArg.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

  const source = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  const dest = new PrismaClient(); // ambient DATABASE_URL — must be UAT's when you run this

  const passwordHash = await bcrypt.hash(testPassword, 10);
  let copied = 0, skipped = 0, phoneSeq = 0;

  try {
    for (const email of emails) {
      const src = await source.member.findUnique({ where: { email }, include: { chapter: true } });
      if (!src) { console.log(`  ✗ skip ${email} — not found in prod`); skipped++; continue; }

      // Ensure the same chapter exists in UAT (by slug), creating a UAT-local row if not.
      let chapter = await dest.chapter.findUnique({ where: { slug: src.chapter.slug } });
      if (!chapter) {
        chapter = await dest.chapter.create({
          data: { name: src.chapter.name, slug: src.chapter.slug, city: src.chapter.city, brandName: src.chapter.brandName },
        });
        console.log(`  + created chapter "${chapter.name}" in UAT`);
      }

      phoneSeq++;
      const placeholderPhone = `+91-90000-${String(phoneSeq).padStart(5, '0')}`;

      await dest.member.upsert({
        where: { email: src.email },
        update: {
          name: src.name, role: src.role, company: src.company, brandName: src.brandName,
          category: src.category, subCategory: src.subCategory, about: src.about,
          website: src.website, photoUrl: src.photoUrl, coverUrl: src.coverUrl,
          phone: placeholderPhone, whatsapp: placeholderPhone,
          passwordHash, mustResetPwd: false, verified: src.verified,
          jitoMembership: src.jitoMembership, active: true,
        },
        create: {
          chapterId: chapter.id, name: src.name, slug: src.slug, email: src.email,
          role: src.role, company: src.company, brandName: src.brandName,
          category: src.category, subCategory: src.subCategory, about: src.about,
          website: src.website, photoUrl: src.photoUrl, coverUrl: src.coverUrl,
          phone: placeholderPhone, whatsapp: placeholderPhone,
          passwordHash, mustResetPwd: false, verified: src.verified,
          jitoMembership: src.jitoMembership,
        },
      });
      console.log(`  ✓ ${src.name} (${src.role}) → ${email}`);
      copied++;
    }
  } finally {
    await source.$disconnect();
    await dest.$disconnect();
  }

  console.log(`\nDone. Copied ${copied}, skipped ${skipped}.`);
  console.log(`All copied accounts share the password you passed in. Phone numbers were replaced with placeholders.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
