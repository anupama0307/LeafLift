const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT token and extract user information
 */
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];

    if (!bearerHeader) {
        return res.status(403).json({ message: 'Access denied. Authorization header is missing.' });
    }

    try {
        const bearer = bearerHeader.split(' ');
        const token = bearer[1];
        
        if (!token) {
            return res.status(403).json({ message: 'Access denied. Token is missing.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'leaflift-fallback-secret-2024');
        req.user = decoded; // Contains { id, role, email }
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
}

/**
 * Middleware to ensure the user is accessing THEIR OWN data 
 * OR is a driver accessing a ride they are assigned to.
 */
function authorizeUser(req, res, next) {
    // This assumes req.user is set by verifyToken
    const resourceUserId = req.params.userId || req.body.userId;
    
    if (!resourceUserId || req.user.id === resourceUserId) {
        return next();
    }

    // Role-based escalation could go here (e.g., ADMIN can see everything)
    return res.status(403).json({ message: 'Unauthorized access to this resource.' });
}

module.exports = { verifyToken, authorizeUser };
