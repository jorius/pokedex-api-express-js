// packages
import pg from 'pg';

// config
import { env } from './Env.js';

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
});

export { pool };
