export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://school:school@localhost:5432/school',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me'
  };
}
