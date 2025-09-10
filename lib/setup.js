import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword, isPasswordHashed } from './auth.js';

// Chercher .env dans le dossier config s'il existe, sinon dans le répertoire courant
const ENV_FILE = fs.existsSync('config') ? path.resolve('config/.env') : path.resolve('.env');
const ENV_EXAMPLE = path.resolve('.env.example');

/**
 * Vérifie si le fichier .env existe et contient les variables requises
 */
export function checkEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    return { exists: false, valid: false, missing: [] };
  }

  const envContent = fs.readFileSync(ENV_FILE, 'utf8');
  const requiredVars = [
    'TRAKT_CLIENT_ID',
    'TRAKT_CLIENT_SECRET', 
    'TMDB_API_KEY',
    'SESSION_SECRET',
    'LANGUAGE',
    'AUTH_ENABLED'
  ];

  const missing = [];
  for (const varName of requiredVars) {
    const regex = new RegExp(`^${varName}=.+$`, 'm');
    if (!regex.test(envContent)) {
      missing.push(varName);
    }
  }

  return {
    exists: true,
    valid: missing.length === 0,
    missing
  };
}

/**
 * Génère un fichier .env avec les valeurs fournies
 */
export function generateEnvFile(config) {
  // Préparer les valeurs d'authentification
  const authEnabled = config.enableAuth === true || config.enableAuth === 'on' || config.enableAuth === 'true';
  const authUsername = authEnabled && config.authUsername ? config.authUsername : '';
  
  // Hasher le mot de passe auth s'il est fourni et pas déjà hashé
  let authPassword = '';
  if (authEnabled && config.authPassword) {
    authPassword = isPasswordHashed(config.authPassword) ? 
      config.authPassword : 
      hashPassword(config.authPassword);
  }
  
  // Hasher le mot de passe full rebuild s'il n'est pas déjà hashé
  const fullRebuildPassword = config.fullRebuildPassword ? (
    isPasswordHashed(config.fullRebuildPassword) ? 
      config.fullRebuildPassword : 
      hashPassword(config.fullRebuildPassword)
  ) : hashPassword(crypto.randomBytes(16).toString('hex'));
  
  const envTemplate = `# Configuration Trakt Enhanced
PORT=${config.port || 30009}
TITLE=Trakt Enhanced

# Trakt API Configuration
TRAKT_CLIENT_ID=${config.traktClientId || ''}
TRAKT_CLIENT_SECRET=${config.traktClientSecret || ''}
OAUTH_REDIRECT_URI=${config.oauthRedirectUri || 'http://localhost:30009/auth/callback'}

# TMDB API Configuration  
TMDB_API_KEY=${config.tmdbApiKey || ''}

# Language Configuration
LANGUAGE=${config.language || 'fr-FR'}

# Authentication
AUTH_ENABLED=${authEnabled ? 'true' : 'false'}
AUTH_USERNAME=${authUsername}
AUTH_PASSWORD=${authPassword}

# Security
SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}
FULL_REBUILD_PASSWORD=${fullRebuildPassword}
`;

  // S'assurer que le dossier config existe
  const envDir = path.dirname(ENV_FILE);
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true });
  }
  
  fs.writeFileSync(ENV_FILE, envTemplate, 'utf8');
  return true;
}

/**
 * Obtient les valeurs par défaut depuis .env.example si disponible
 */
export function getDefaultConfig() {
  const defaults = {
    port: 30009,
    traktClientId: '',
    traktClientSecret: '',
    tmdbApiKey: '',
    language: 'fr-FR'
  };

  if (fs.existsSync(ENV_EXAMPLE)) {
    const exampleContent = fs.readFileSync(ENV_EXAMPLE, 'utf8');
    const lines = exampleContent.split('\n');
    
    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && value && defaults.hasOwnProperty(toCamelCase(key))) {
        defaults[toCamelCase(key)] = value;
      }
    }
  }

  return defaults;
}

/**
 * Convertit SNAKE_CASE en camelCase
 */
function toCamelCase(str) {
  return str.toLowerCase().replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}