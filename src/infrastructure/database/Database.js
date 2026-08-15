// packages
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// config
import { env } from '../config/Env.js';
// database
import * as schema from './Schema.js';

/** Single pg pool + Drizzle instance per process; closed by GracefulShutdown. */
const pool = new pg.Pool({ connectionString: env.databaseUrl });
const db = drizzle(pool, { schema });

export { db, pool };
