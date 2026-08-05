import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLES } from '../src/hierarchy/permissions';

const prisma = new PrismaClient();

async function main() {
  // Role registry (President, Co-President, Secretary, Treasurer, Super Admin, Member, ...)
  for (const r of DEFAULT_ROLES) {
    await prisma.roleDef.upsert({ where: { key: r.key }, update: r as any, create: r as any });
  }
  // The Meerut chapter, branded GATI
  const chapter = await prisma.chapter.upsert({
    where: { slug: 'meerut' },
    update: { name: 'GATI — Meerut', city: 'Meerut', brandName: 'GATI', logoUrl: '/chapters/jito-meerut.jpg' },
    create: { name: 'GATI — Meerut', slug: 'meerut', city: 'Meerut', brandName: 'GATI', logoUrl: '/chapters/jito-meerut.jpg' },
  });
  const group = await prisma.referralGroup.findFirst({ where: { chapterId: chapter.id } });
  if (!group) await prisma.referralGroup.create({ data: { chapterId: chapter.id, name: 'GATI Pioneer' } });

  console.log('Base ready: roles + GATI (Meerut) chapter. No demo members.');
}
main().finally(() => prisma.$disconnect());
