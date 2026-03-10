const crypto = require('crypto');

// The algorithm to use for encryption
const ALGORITHM = 'aes-256-cbc';
// Ensure we have a 32-byte key. In production, this MUST be in .env and be 32 bytes.
// If it's shorter, we pad it. If it's missing, we use a fallback for dev.
const secret = process.env.LOCATION_ENCRYPTION_KEY || 'leaflift-secure-location-key-2024-!!';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(secret)).digest();
const IV_LENGTH = 16;

/**
 * Encrypts a number or string (typically lat/lng)
 * @param {number|string} val 
 * @returns {string} Encrypted string in format iv:ciphertext
 */
function encrypt(val) {
    if (val === null || val === undefined) return val;

    // Prevent double encryption
    if (typeof val === 'string' && val.includes(':') && val.length > 32) {
        return val;
    }

    try {
        const text = val.toString();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (err) {
        console.error('Encryption error:', err);
        return val;
    }
}

/**
 * Decrypts an encrypted string back to a number
 * @param {string} encryptedText 
 * @returns {number|any} Decrypted number or original value if not encrypted
 */
function decrypt(encryptedText) {
    if (typeof encryptedText !== 'string' || !encryptedText.includes(':')) {
        return encryptedText;
    }

    try {
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encrypted = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        const result = decrypted.toString();
        return parseFloat(result);
    } catch (err) {
        // If decryption fails, it might be plain text from before encryption was enabled
        return encryptedText;
    }
}

/**
 * Helper to determine if a value is encrypted
 * @param {any} val 
 * @returns {boolean}
 */
function isEncrypted(val) {
    return typeof val === 'string' && val.includes(':') && val.length > 32;
}

module.exports = { encrypt, decrypt, isEncrypted };
