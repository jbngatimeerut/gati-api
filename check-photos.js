const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.member.findMany({ take: 5, select: { name: true, photoUrl: true } });
  console.log("Users:");
  users.forEach(u => console.log(`- ${u.name}: ${u.photoUrl}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
