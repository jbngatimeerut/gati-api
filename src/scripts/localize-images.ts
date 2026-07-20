/** Download member photos + product images from Google Drive into our own storage. */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const DIR = join(process.cwd(), 'uploads');

function driveId(url: string): string | null {
  const q = url.match(/[?&]id=([-\w]{20,})/);       // our /api/img?id=... proxy form
  if (q) return q[1];
  if (!/drive\.google|googleusercontent|docs\.google/.test(url)) return null;
  const m = url.match(/[-\w]{25,}/);                 // raw Drive/lh3 URL
  return m ? m[0] : null;
}
async function download(id: string, dest: string): Promise<boolean> {
  for (const url of [`https://lh3.googleusercontent.com/d/${id}=w1400`, `https://drive.google.com/thumbnail?id=${id}&sz=w1400`]) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      const type = r.headers.get('content-type') || '';
      if (r.ok && type.startsWith('image/')) { writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return true; }
    } catch { /* try next */ }
  }
  return false;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const members = await prisma.member.findMany();
  const withPhoto = members.filter((x) => x.photoUrl).length;
  const withProd = members.filter((x) => x.productImages).length;
  console.log(`Members: ${members.length} | with photoUrl: ${withPhoto} | with productImages: ${withProd}`);
  if (members[0]) console.log('sample photoUrl:', members.find((x) => x.photoUrl)?.photoUrl);
  const remoteRe = /drive\.google|googleusercontent|docs\.google|\/api\/img/;
  const remotePhotos = members.filter((x) => x.photoUrl && remoteRe.test(x.photoUrl)).length;
  const remoteProds = members.filter((x) => x.productImages && x.productImages.split(',').some((u) => remoteRe.test(u))).length;
  console.log(`Still on Drive -> photos: ${remotePhotos}, members with remote product images: ${remoteProds}`);
  let changed = 0;
  for (const m of members) {
    let photoUrl = m.photoUrl;
    const pid = m.photoUrl ? driveId(m.photoUrl) : null;
    if (pid) { const f = `${m.slug}-photo.jpg`; if (await download(pid, join(DIR, f))) photoUrl = `/api/uploads/${f}`; }

    let productImages = m.productImages;
    if (m.productImages) {
      const out: string[] = []; let i = 0;
      for (const raw of m.productImages.split(',').map((s) => s.trim()).filter(Boolean)) {
        const gid = driveId(raw);
        if (gid) { const f = `${m.slug}-prod-${i++}.jpg`; if (await download(gid, join(DIR, f))) { out.push(`/api/uploads/${f}`); continue; } }
        out.push(raw);
      }
      productImages = out.join(',');
    }
    if (photoUrl !== m.photoUrl || productImages !== m.productImages) {
      await prisma.member.update({ where: { id: m.id }, data: { photoUrl, productImages } });
      changed++; console.log(`✓ ${m.name}`);
    }
  }
  console.log(`Localised media for ${changed} members. Files stored in ./uploads (served at /api/uploads/).`);
}
main().finally(() => prisma.$disconnect());
