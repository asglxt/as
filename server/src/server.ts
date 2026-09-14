import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate } from './migrate.ts';

const config = loadConfig();
await migrate(config.databaseUrl);
const app = await buildApp();
await app.listen({ port: config.port, host: '0.0.0.0' });
