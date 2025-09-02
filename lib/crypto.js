/**
 * Crypto Module - Chiffrement et sécurité
 */

import crypto from 'node:crypto';
import { logger } from './logger.js';

// Configuration du chiffrement
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const TAG_LENGTH = 16; // 128 bits

// Clé de chiffrement dérivée du secret de session ou variable d'environnement
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-key-change-in-production';
  
  if (secret === 'default-key-change-in-production' && process.env.NODE_ENV === 'production') {
    logger.warn('SECURITY: Using default encryption key in production!');
  }
  
  // Dériver une clé stable de 32 bytes
  return crypto.scryptSync(secret, 'trakt-history-salt', KEY_LENGTH);
}

/**
 * Chiffre des données sensibles
 * @param {string|object} data - Données à chiffrer
 * @returns {string} Données chiffrées en base64
 */
export function encrypt(data) {
  try {
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from('trakt-history-aad'));
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combiner IV + TAG + données chiffrées
    const result = Buffer.concat([
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]).toString('base64');
    
    return result;
    
  } catch (error) {
    logger.error('Encryption failed', { error: error.message });
    throw new Error('Encryption failed');
  }
}

/**
 * Déchiffre des données
 * @param {string} encryptedData - Données chiffrées en base64
 * @returns {string|object} Données déchiffrées
 */
export function decrypt(encryptedData) {
  try {
    const key = getEncryptionKey();
    const buffer = Buffer.from(encryptedData, 'base64');
    
    // Extraire IV, TAG et données
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from('trakt-history-aad'));
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    // Essayer de parser en JSON, sinon retourner string
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
    
  } catch (error) {
    logger.error('Decryption failed', { error: error.message });
    throw new Error('Decryption failed');
  }
}

/**
 * Génère un token CSRF sécurisé
 * @returns {string} Token CSRF
 */
export function generateCSRFToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Vérifie un token CSRF
 * @param {string} token - Token à vérifier
 * @param {string} expected - Token attendu
 * @returns {boolean} Validité du token
 */
export function verifyCSRFToken(token, expected) {
  if (!token || !expected) return false;
  
  try {
    const tokenBuffer = Buffer.from(token, 'base64url');
    const expectedBuffer = Buffer.from(expected, 'base64url');
    
    // Vérifier que les buffers ont la même longueur
    if (tokenBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
  } catch (error) {
    // En cas d'erreur de décodage base64url ou autre
    return false;
  }
}

/**
 * Génère un hash sécurisé (pour les mots de passe, etc.)
 * @param {string} data - Données à hasher
 * @param {string} salt - Salt optionnel
 * @returns {string} Hash en hexadécimal
 */
export function secureHash(data, salt = '') {
  const hash = crypto.createHash('sha256');
  hash.update(data + salt + 'trakt-history-pepper');
  return hash.digest('hex');
}

/**
 * Génère un salt aléatoire
 * @returns {string} Salt en hexadécimal
 */
export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Chiffre spécifiquement les tokens Trakt
 * @param {object} tokenData - Données du token Trakt
 * @returns {string} Token chiffré
 */
export function encryptTraktToken(tokenData) {
  logger.info('Encrypting Trakt token');
  return encrypt(tokenData);
}

/**
 * Déchiffre les tokens Trakt
 * @param {string} encryptedToken - Token chiffré
 * @returns {object} Données du token
 */
export function decryptTraktToken(encryptedToken) {
  logger.debug('Decrypting Trakt token');
  return decrypt(encryptedToken);
}

export default {
  encrypt,
  decrypt,
  generateCSRFToken,
  verifyCSRFToken,
  secureHash,
  generateSalt,
  encryptTraktToken,
  decryptTraktToken
};