import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {

  const performance = await prisma.performance.create({
    data: {
      title: '테스트 공연',
      date: new Date('2024-12-31T19:00:00Z'),
      venue: '올림픽공원',
      seats: {
        create: Array.from({ length: 100 }, (_, i) => ({
          seatNumber: `A-${i + 1}`,
          status: 'AVAILABLE',
        })),
      },
    },
  });

  console.log('✅ Seed data created:', performance);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

