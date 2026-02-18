/**
 * =============================================================================
 * LeafLift - Swagger/OpenAPI Configuration
 * =============================================================================
 * Auto-generated API documentation at /api-docs
 * =============================================================================
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

/**
 * Swagger options
 */
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'LeafLift API',
            version: '1.0.0',
            description: `
## LeafLift - Modern Sustainable Ride-Sharing

Production-grade API for the LeafLift platform featuring:
- **Ride Pooling** with smart routing algorithms used to reduce carbon footprint
- **Real-time Updates** via Socket.io
- **Role-based Authentication** (Rider/Driver)
- **Sustainability Metrics** tracking

### Authentication
All protected endpoints require a JWT token in the Authorization header:
\`\`\`
Authorization: Bearer <token>
\`\`\`
            `,
            contact: {
                name: 'LeafLift Support',
                email: 'support@leaflift.com',
            },
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                // Shared schemas can be defined here if not in JSDoc
            }
        },
        tags: [
            { name: 'Auth', description: 'Authentication endpoints' },
            { name: 'Rides', description: 'Ride management' },
            { name: 'Users', description: 'User profile management' },
        ],
    },
    apis: ['./index.js'], // Look for JSDoc comments in the main server file
};

/**
 * Setup Swagger documentation
 * @param {import('express').Application} app 
 */
function setupSwagger(app) {
    const swaggerSpec = swaggerJsdoc(swaggerOptions);

    // Serve Swagger UI at /api-docs
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'LeafLift API Docs',
    }));

    // Also serve docs at /dev-docs as requested
    app.use('/dev-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'LeafLift Dev Docs',
    }));

    // Serve raw OpenAPI spec
    app.get('/api-docs.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });

    console.log('📄 Swagger Docs available at http://localhost:5000/api-docs');
}

module.exports = { setupSwagger };
