import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
    'LANGUAGE'
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
  const envTemplate = `# Configuration Trakt Enhanced
PORT=${config.port || 30009}
TITLE=Trakt Enhanced

# Trakt API Configuration
TRAKT_CLIENT_ID=${config.traktClientId || ''}
TRAKT_CLIENT_SECRET=${config.traktClientSecret || ''}

# TMDB API Configuration  
TMDB_API_KEY=${config.tmdbApiKey || ''}

# Language Configuration
LANGUAGE=${config.language || 'fr-FR'}

# Security
SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}
FULL_REBUILD_PASSWORD=${config.fullRebuildPassword || crypto.randomBytes(16).toString('hex')}
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