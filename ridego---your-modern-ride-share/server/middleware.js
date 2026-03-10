/**
 * Server middleware collection for LeafLift RideGo
 * - Rate limiting
 * - Input validation & sanitization
 * - Error handling
 * - Request logging
 * - Security headers
 */

// ────────────────────────────────────────────────────────────────────────────────
// 1. RATE LIMITER — In-memory sliding window (no Redis dependency)
// ────────────────────────────────────────────────────────────────────────────────

class RateLimitStore {
    constructor() {
        this.hits = new Map();           // key -> { count, windowStart }
        this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
    }

    _cleanup() {
        const now = Date.now();
        for (const [key, data] of this.hits) {
            if (now - data.windowStart > data.windowMs * 2) {
                this.hits.delete(key);
            }
        }
    }

    increment(key, windowMs) {
        const now = Date.now();
        const existing = this.hits.get(key);

        if (!existing || (now - existing.windowStart) > windowMs) {
            this.hits.set(key, { count: 1, windowStart: now, windowMs });
            return { count: 1, remaining: -1, resetTime: now + windowMs };
        }

        existing.count += 1;
        return {
            count: existing.count,
            remaining: -1,
            resetTime: existing.windowStart + windowMs
        };
    }

    destroy() {
        clearInterval(this.cleanupInterval);
        this.hits.clear();
    }
}

const rateLimitStore = new RateLimitStore();

/**
 * Rate limiting middleware factory
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 min)
 * @param {number} options.max - Max requests per window (default: 100)
 * @param {string} options.message - Error message
 * @param {Function} options.keyGenerator - Custom key generator (default: IP)
 * @param {boolean} options.skipFailedRequests - Don't count failed requests
 */
function rateLimit(options = {}) {
    const {
        windowMs = 60000,
        max = 100,
        message = 'Too many requests, please try again later.',
        keyGenerator = (req) => req.ip || req.connection?.remoteAddress || 'unknown',
        skipFailedRequests = false
    } = options;

    return (req, res, next) => {
        const key = keyGenerator(req);
        const result = rateLimitStore.increment(key, windowMs);

        // Set rate limit headers
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', String(Math.max(0, max - result.count)));
        res.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));

        if (result.count > max) {
            res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
            return res.status(429).json({
                error: 'RATE_LIMIT_EXCEEDED',
                message,
                retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
            });
        }

        next();
    };
}

// Pre-configured rate limiters for different endpoint types
const rateLimiters = {
    // General API: 100 requests per minute
    general: rateLimit({ windowMs: 60000, max: 100 }),

    // Auth endpoints: 10 per minute (prevent brute force)
    auth: rateLimit({
        windowMs: 60000,
        max: 10,
        message: 'Too many authentication attempts. Please wait before trying again.'
    }),

    // OTP sending: 3 per minute per IP
    otp: rateLimit({
        windowMs: 60000,
        max: 3,
        message: 'OTP request limit reached. Please wait 1 minute before requesting again.'
    }),

    // Ride creation: 5 per minute
    rideCreate: rateLimit({
        windowMs: 60000,
        max: 5,
        message: 'Too many ride requests. Please wait before creating another ride.'
    }),

    // Location updates: 120 per minute (2 per second is reasonable for real-time tracking)
    locationUpdate: rateLimit({ windowMs: 60000, max: 120 }),

    // Search/autocomplete: 30 per minute
    search: rateLimit({
        windowMs: 60000,
        max: 30,
        message: 'Search rate limit reached. Please slow down.'
    }),

    // SOS: 5 per hour (prevent spam but allow real emergencies)
    sos: rateLimit({
        windowMs: 3600000,
        max: 5,
        message: 'SOS alert limit reached. Contact emergency services directly if needed.'
    }),

    // Admin: 200 per minute (higher for admin dashboards)
    admin: rateLimit({ windowMs: 60000, max: 200 }),

    // File upload: 10 per 5 minutes
    upload: rateLimit({
        windowMs: 300000,
        max: 10,
        message: 'File upload limit reached. Please wait before uploading again.'
    })
};


// ────────────────────────────────────────────────────────────────────────────────
// 2. INPUT VALIDATION & SANITIZATION
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize a string to prevent XSS and injection attacks
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/[<>]/g, '')                // Strip HTML angle brackets
        .replace(/javascript:/gi, '')         // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '')           // Remove event handlers
        .replace(/\$/g, '')                   // Remove MongoDB operators
        .trim();
}

/**
 * Recursively sanitize all string values in an object
 */
function sanitizeObject(obj) {
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item));
    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            // Skip internal MongoDB/Mongoose fields
            if (key.startsWith('$')) continue;
            sanitized[sanitizeString(key)] = sanitizeObject(value);
        }
        return sanitized;
    }
    return obj;
}

/**
 * Middleware to sanitize all incoming request data
 */
function sanitizeInput(req, res, next) {
    if (req.body) req.body = sanitizeObject(req.body);
    if (req.query) req.query = sanitizeObject(req.query);
    if (req.params) req.params = sanitizeObject(req.params);
    next();
}

/**
 * Validate coordinates
 */
function isValidCoordinates(lat, lng) {
    return (
        typeof lat === 'number' && typeof lng === 'number' &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        !isNaN(lat) && !isNaN(lng)
    );
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email) && email.length <= 254;
}

/**
 * Validate Indian phone number
 */
function isValidPhone(phone) {
    if (typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    return /^(\+91)?[6-9]\d{9}$/.test(cleaned);
}

/**
 * Validate MongoDB ObjectId
 */
function isValidObjectId(id) {
    return /^[a-fA-F0-9]{24}$/.test(id);
}

/**
 * Validate password strength
 */
function isStrongPassword(password) {
    if (typeof password !== 'string') return false;
    return (
        password.length >= 8 &&
        password.length <= 128 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password)
    );
}

/**
 * Validation middleware factory - validates req.body against a schema
 * @param {Object} schema - Key-value where value is { required, type, validator, message }
 */
function validateBody(schema) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];

            // Check required
            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push({ field, message: rules.message || `${field} is required` });
                continue;
            }

            // Skip non-required empty fields
            if (value === undefined || value === null) continue;

            // Check type
            if (rules.type && typeof value !== rules.type) {
                errors.push({ field, message: `${field} must be of type ${rules.type}` });
                continue;
            }

            // Check custom validator
            if (rules.validator && !rules.validator(value)) {
                errors.push({ field, message: rules.message || `${field} is invalid` });
            }

            // Check min/max for numbers
            if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
                errors.push({ field, message: `${field} must be at least ${rules.min}` });
            }
            if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
                errors.push({ field, message: `${field} must be at most ${rules.max}` });
            }

            // Check minLength/maxLength for strings
            if (rules.minLength !== undefined && typeof value === 'string' && value.length < rules.minLength) {
                errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
            }
            if (rules.maxLength !== undefined && typeof value === 'string' && value.length > rules.maxLength) {
                errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters` });
            }

            // Check enum
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}` });
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: errors
            });
        }

        next();
    };
}

// Pre-built validation schemas
const validationSchemas = {
    signup: {
        email: { required: true, type: 'string', validator: isValidEmail, message: 'Valid email is required' },
        phone: { required: true, type: 'string', validator: isValidPhone, message: 'Valid Indian phone number is required' },
        firstName: { required: true, type: 'string', minLength: 1, maxLength: 50 },
        lastName: { required: true, type: 'string', minLength: 1, maxLength: 50 },
        role: { required: true, type: 'string', enum: ['RIDER', 'DRIVER'] },
        dob: { required: true, type: 'string' },
        gender: { required: true, type: 'string', enum: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] }
    },

    createRide: {
        userId: { required: true, type: 'string', validator: isValidObjectId, message: 'Valid userId required' },
        rideType: { required: true, type: 'string' },
        paymentMethod: { required: true, type: 'string', enum: ['Cash', 'UPI', 'Wallet', 'Card'] }
    },

    review: {
        rideId: { required: true, type: 'string', validator: isValidObjectId },
        rating: { required: true, type: 'number', min: 1, max: 5 },
        comment: { required: false, type: 'string', maxLength: 500 }
    },

    dispute: {
        rideId: { required: true, type: 'string', validator: isValidObjectId },
        category: {
            required: true,
            type: 'string',
            enum: ['FARE_DISPUTE', 'WRONG_ROUTE', 'SAFETY_CONCERN', 'VEHICLE_CONDITION',
                   'DRIVER_BEHAVIOR', 'RIDER_BEHAVIOR', 'PAYMENT_ISSUE', 'LOST_ITEM',
                   'CANCELLATION_FEE', 'OVERCHARGE', 'RIDE_NOT_COMPLETED', 'OTHER']
        },
        description: { required: true, type: 'string', minLength: 10, maxLength: 2000 }
    }
};


// ────────────────────────────────────────────────────────────────────────────────
// 3. ERROR HANDLING
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Custom application error class
 */
class AppError extends Error {
    constructor(statusCode, code, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
    }
}

/**
 * Async route handler wrapper — catches errors and forwards to error middleware
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Global error handling middleware
 */
function errorHandler(err, req, res, _next) {
    // Log error details (but not in test environment)
    if (process.env.NODE_ENV !== 'test') {
        console.error(`[ERROR] ${req.method} ${req.path}`, {
            code: err.code || 'INTERNAL_ERROR',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const details = Object.values(err.errors).map(e => ({
            field: e.path,
            message: e.message
        }));
        return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Data validation failed',
            details
        });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || 'unknown';
        return res.status(409).json({
            error: 'DUPLICATE_ERROR',
            message: `A record with this ${field} already exists`
        });
    }

    // Mongoose cast error (invalid ObjectId etc.)
    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'INVALID_ID',
            message: `Invalid ${err.path}: ${err.value}`
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'INVALID_TOKEN',
            message: 'Authentication token is invalid'
        });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'TOKEN_EXPIRED',
            message: 'Authentication token has expired'
        });
    }

    // Custom application errors
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.code,
            message: err.message,
            ...(err.details ? { details: err.details } : {})
        });
    }

    // Default: Internal server error
    res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development'
            ? err.message
            : 'An unexpected error occurred. Please try again.'
    });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`
    });
}


// ────────────────────────────────────────────────────────────────────────────────
// 4. REQUEST LOGGING
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
    const start = Date.now();
    const { method, path } = req;

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';

        // Skip health checks and static assets
        if (path === '/api/health' || path.startsWith('/assets')) return;

        console.log(`[${level}] ${method} ${path} ${status} ${duration}ms`);
    });

    next();
}


// ────────────────────────────────────────────────────────────────────────────────
// 5. SECURITY HEADERS
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Security headers middleware
 */
function securityHeaders(req, res, next) {
    // Prevent MIME type sniffing
    res.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    res.set('X-Frame-Options', 'DENY');
    // XSS protection
    res.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions policy
    res.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    // Remove server identification
    res.removeHeader('X-Powered-By');

    next();
}


// ────────────────────────────────────────────────────────────────────────────────
// 6. CORS CONFIGURATION HELPER
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Create CORS options with allowed origins
 */
function createCorsOptions() {
    const allowedOrigins = [
        'http://localhost:3005',
        'http://localhost:3006',
        'http://localhost:5173',
        'http://localhost:5174',
        process.env.FRONTEND_URL,
        process.env.ADMIN_URL
    ].filter(Boolean);

    return {
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, curl, etc.)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, true); // In development, allow all. Tighten for production.
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
        maxAge: 86400  // Cache preflight for 24 hours
    };
}


// ────────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────────

module.exports = {
    // Rate limiting
    rateLimit,
    rateLimiters,
    rateLimitStore,

    // Validation
    sanitizeInput,
    sanitizeString,
    sanitizeObject,
    validateBody,
    validationSchemas,
    isValidCoordinates,
    isValidEmail,
    isValidPhone,
    isValidObjectId,
    isStrongPassword,

    // Error handling
    AppError,
    asyncHandler,
    errorHandler,
    notFoundHandler,

    // Logging
    requestLogger,

    // Security
    securityHeaders,
    createCorsOptions
};
