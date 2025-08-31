/**
 * Template Module - Remplacement des placeholders dans les templates
 */

import fs from 'node:fs/promises';
import { logger } from './logger.js';

/**
 * Remplace les placeholders dans un template HTML
 * @param {string} templatePath - Chemin vers le fichier template
 * @param {object} variables - Variables à remplacer
 * @returns {string} Template avec variables remplacées
 */
export async function renderTemplate(templatePath, variables = {}) {
  try {
    let content = await fs.readFile(templatePath, 'utf-8');
    
    // Remplacer les placeholders
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `<!-- ${key.toUpperCase()} -->`;
      content = content.replace(new RegExp(placeholder, 'g'), value || '');
    }
    
    return content;
    
  } catch (error) {
    logger.error('Template rendering failed', { 
      templatePath, 
      error: error.message 
    });
    throw error;
  }
}

export default {
  renderTemplate
};