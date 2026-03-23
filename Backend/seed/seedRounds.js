require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.roundControl.upsert({ where: { roundNumber: 1 }, update: {}, create: { roundNumber: 1, isLive: true } });
    await prisma.roundControl.upsert({ where: { roundNumber: 2 }, update: {}, create: { roundNumber: 2, isLive: true } });
    console.log('Rounds seeded: Round 1 & 2 both live.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
