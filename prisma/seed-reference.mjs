/**
 * Reference-data seed for the production container.
 *
 * Plain ESM with no build step, so it runs inside the Docker image where only
 * @prisma/client and bcryptjs are available. Invoked by docker-entrypoint.sh
 * when RUN_SEED_ON_START=true.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedReferenceData } from './reference-data.mjs';

const prisma = new PrismaClient();

try {
  console.log('Seeding reference data…');
  await seedReferenceData(prisma, bcrypt, { log: (msg) => console.log(msg) });
  console.log('Reference data ready.');
} catch (error) {
  console.error('Reference seed failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
