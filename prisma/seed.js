require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../src/config/prisma');

const SALT_ROUNDS = 10;

async function seed() {
  console.log('Starting database seeding...');

  const adminPasswordHash = await bcrypt.hash('Admin@123', SALT_ROUNDS);
  const userPasswordHash = await bcrypt.hash('User@123', SALT_ROUNDS);

  // Upsert Admin account (idempotent)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      name: 'System Admin',
      password: adminPasswordHash,
      role: 'ADMIN',
    },
    create: {
      name: 'System Admin',
      email: 'admin@example.com',
      password: adminPasswordHash,
      role: 'ADMIN',
    },
  });
  console.log(`Successfully seeded user: ${admin.email} [Role: ${admin.role}]`);

  // Upsert Regular User account (idempotent)
  const regularUser = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {
      name: 'Test User',
      password: userPasswordHash,
      role: 'USER',
    },
    create: {
      name: 'Test User',
      email: 'user@example.com',
      password: userPasswordHash,
      role: 'USER',
    },
  });
  console.log(`Successfully seeded user: ${regularUser.email} [Role: ${regularUser.role}]`);

  console.log('Database seeding completed successfully.');
}

seed()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
