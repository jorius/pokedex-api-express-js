// packages
import dotenv from 'dotenv';

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  pokeApiBaseUrl: process.env.POKEAPI_BASE_URL ?? 'https://pokeapi.co/api/v2',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  isProduction: process.env.NODE_ENV === 'production',
};

export { env };
