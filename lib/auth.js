/**
 * Authentication Module
 * Gestion du hashage et vérification des mots de passe
 */

import crypto from 'node:crypto';

/**
 * Hash un mot de passe avec un salt aléatoire
 * @param {string} password - Mot de passe en clair
 * @returns {string} Hash au format "salt:hash"
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Vérifie un mot de passe contre un hash
 * @param {string} password - Mot de passe en clair à vérifier
 * @param {string} hashedPassword - Hash stocké au format "salt:hash"
 * @returns {boolean} True si le mot de passe correspond
 */
export function verifyPassword(password, hashedPassword) {
  if (!hashedPassword || !hashedPassword.includes(':')) {
    return false;
  }
  
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === verifyHash;
}

/**
 * Vérifie si un string est déjà hashé (contient un salt)
 * @param {string} password - String à vérifier
 * @returns {boolean} True si déjà hashé
 */
export function isPasswordHashed(password) {
  return password && typeof password === 'string' && password.includes(':');
}