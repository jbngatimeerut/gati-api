import { PrismaClient } from '@prisma/client';
import { FEATURES } from '../admin/admin.service';

const prisma = new PrismaClient();

async function main() {
  const members = await prisma.member.findMany({ select: { id: true } });
  let n = 0;
  for (const m of members) {
    for (const f of FEATURES) {
      await prisma.featureGrant.upsert({
        where: { feature_memberId: { feature: f.key, memberId: m.id } },
        update: {},
        create: { feature: f.key, memberId: m.id },
      });
      n++;
    }
  }
  console.log(`Granted ${FEATURES.length} features to ${members.length} members (${n} upserts).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
