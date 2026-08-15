// packages
import swaggerJsdoc from 'swagger-jsdoc';

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Pokedex API (Express + JavaScript)',
      description: 'REST API documentation for the Pokedex service. Available in non-production environments only.',
      version: '0.1.0',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/presentation/routes/*.js', './src/presentation/swagger/schemas/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export { swaggerSpec };
