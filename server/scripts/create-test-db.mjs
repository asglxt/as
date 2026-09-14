import pg from 'pg';

const adminUrl = process.env.ADMIN_DATABASE_URL ?? 'postgres://school:school@localhost:5432/postgres';
const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  await client.query('CREATE DATABASE school_test');
  console.log('test database created');
} catch (err) {
  if (err.code === '42P04') {
    console.log('test database already exists');
  } else {
    throw err;
  }
}
await client.end();
