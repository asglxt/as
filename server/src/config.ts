export interface Config {
  port: number;
  webUrl: string;
  databaseUrl: string;
  jwtSecret: string;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://school:school@localhost:5432/school',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me'
  };
}
