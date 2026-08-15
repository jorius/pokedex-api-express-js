// packages
import express from 'express';
import swaggerUi from 'swagger-ui-express';

// config
import { env } from '../infrastructure/config/Env.js';
import { swaggerSpec } from './swagger/Swagger.js';

// routes
import authRoutes from './routes/AuthRoutes.js';
import pokemonsRoutes from './routes/PokemonsRoutes.js';

// middleware
import { cors } from './middleware/Cors.js';
import { errorHandler } from './middleware/ErrorHandler.js';
// utils
import { fail } from './utils/Response.js';

const createApp = () => {
  const app = express();

  app.use(cors);
  app.use(express.json());

  // Swagger is available in every non-production environment and disabled in production.
  if (!env.isProduction) {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  app.use('/api/pokemons', pokemonsRoutes);
  app.use('/api/auth', authRoutes);

  // Unknown routes still get the standard response envelope, not Express's default HTML.
  app.use((_req, res) => {
    res.status(404).json(fail('NotFound', 'Route not found'));
  });

  app.use(errorHandler);

  return app;
};

export { createApp };
