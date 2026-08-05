/** Assign a role to a member.  npm run set:role -- <phone-or-email> <ROLE_KEY> */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const idArg = process.argv[2];
  const roleKey = process.argv[3];
  if (!idArg || !roleKey) {
    console.error('Usage: npm run set:role -- <phone-or-email> <ROLE_KEY>');
    console.error('Roles: APEX_ADMIN, CHAPTER_PRESIDENT, CHAPTER_CO_PRESIDENT, CHAPTER_SECRETARY, CHAPTER_TREASURER, CONVENER, CO_CONVENER, MEMBER');
    process.exit(1);
  }
  const digits = idArg.replace(/[^0-9]/g, '');
  const member = await prisma.member.findFirst({
    where: { OR: [
      { email: idArg.toLowerCase() },
      ...(digits.length >= 10 ? [{ phone: { contains: digits.slice(-10) } }] : []),
    ] },
  });
  if (!member) { console.error('No member found for', idArg); process.exit(1); }
  const role = await prisma.roleDef.findUnique({ where: { key: roleKey } });
  if (!role) { console.error('Unknown role key:', roleKey); process.exit(1); }
  await prisma.member.update({ where: { id: member.id }, data: { role: roleKey } });
  console.log(`✓ ${member.name} (${member.phone || member.email}) is now ${role.label} [${roleKey}]`);
}
main().finally(() => prisma.$disconnect());
