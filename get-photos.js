const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const members = await prisma.member.findMany({ select: { name: true, photoUrl: true } });
  let count = 0;
  for (const m of members) {
    if (m.photoUrl && !m.photoUrl.startsWith('/api/uploads')) {
      console.log(`Original: ${m.name} -> ${m.photoUrl}`);
      count++;
    }
  }
  console.log(`Found ${count} original photoUrls.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
