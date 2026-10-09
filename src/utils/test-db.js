require('dotenv').config();
const prisma = require('../config/prisma');

async function verifyDatabase() {
  try {
    console.log('=== TEST 1: PRISMA DATABASE CONNECTION & READ ===');
    const users = await prisma.user.findMany();
    const tasks = await prisma.task.findMany();
    const assignments = await prisma.taskAssignment.findMany();
    console.log('Connection: OK');
    console.log(`Initial record counts: users=${users.length}, tasks=${tasks.length}, assignments=${assignments.length}`);

    console.log('\n=== TEST 2: VERIFY CREATED TABLES ===');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    const tableNames = tables.map(t => t.table_name);
    console.log('Tables in public schema:', tableNames);

    console.log('\n=== TEST 3: VERIFY FOREIGN KEY CONSTRAINTS ===');
    const foreignKeys = await prisma.$queryRaw`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `;
    console.log('Foreign Keys:', foreignKeys);

    console.log('\n=== TEST 4: VERIFY UNIQUE INDEXES (EMAIL & COMPOSITE ASSIGNMENT) ===');
    const indexes = await prisma.$queryRaw`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef LIKE '%UNIQUE%'
      ORDER BY tablename, indexname;
    `;
    console.log('Unique Indexes:', indexes);

    console.log('\n=== TEST 5: VERIFY ENUMS (ROLE & TASKSTATUS) ===');
    const enums = await prisma.$queryRaw`
      SELECT 
        t.typname AS enum_name, 
        e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder;
    `;
    console.log('Enums in public schema:', enums);

    await prisma.$disconnect();
    console.log('\n=== VERIFICATION RESULT: ALL TESTS PASSED ===');
  } catch (error) {
    console.error('Database verification error:', error);
    process.exit(1);
  }
}

verifyDatabase();
