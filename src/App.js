// packages
import express from 'express';
import swaggerUi from 'swagger-ui-express';

// config
import { env } from './config/Env.js';
import { swaggerSpec } from './config/Swagger.js';

// routes
import authRoutes from './routes/AuthRoutes.js';
import pokemonsRoutes from './routes/PokemonsRoutes.js';

// middleware
import { errorHandler } from './middleware/ErrorHandler.js';

const createApp = () => {
  const app = express();

  app.use(express.json());

  // Swagger is available in every non-production environment and disabled in production.
  if (!env.isProduction) {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  app.use('/api/v1/pokemons', pokemonsRoutes);
  app.use('/api/v1/auth', authRoutes);

  app.use(errorHandler);

  return app;
};

export { createApp };
