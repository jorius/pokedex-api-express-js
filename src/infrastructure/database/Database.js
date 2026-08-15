// packages
import pg from 'pg';

// config
import { env } from '../config/Env.js';

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
});

export { pool };
