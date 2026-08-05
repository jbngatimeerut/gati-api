const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.message.count();
  console.log("Total messages:", count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
