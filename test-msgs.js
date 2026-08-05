const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const msgs = await prisma.message.findMany({ include: { from: true, to: true } });
  console.log("Messages:");
  msgs.forEach(m => {
     console.log(`- From: ${m.from?.name} (${m.fromId}) to ${m.to?.name} (${m.toId}): ${m.body}`);
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
