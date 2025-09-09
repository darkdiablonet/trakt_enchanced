#!/usr/bin/env node
/**
 * Debug les différences poster_path entre curl et tmdb.js
 */

import { tmdbGet, getCachedMeta } from './lib/tmdb.js';

const testId = 234538;

console.log('=== DEBUG POSTER_PATH DIFFERENCES ===\n');

console.log('1. Test tmdbGet direct (comme curl):');
try {
  const direct = await tmdbGet('tv', testId);
  console.log(`Direct tmdbGet poster_path: ${direct?.poster_path}`);
  console.log(`Direct tmdbGet id: ${direct?.id}`);
  console.log(`Direct tmdbGet name: ${direct?.name}`);
} catch (err) {
  console.error('Erreur tmdbGet:', err.message);
}

console.log('\n2. Test getCachedMeta (utilisé par l\'app):');
try {
  // Simuler un appel app avec titre/année
  const cached = await getCachedMeta(null, 'tv', 'The Traitors', '2024', testId, 'w342');
  console.log(`getCachedMeta poster: ${cached?.poster}`);
  console.log(`getCachedMeta tmdbUrl: ${cached?.tmdbUrl}`);
} catch (err) {
  console.error('Erreur getCachedMeta:', err.message);
}

console.log('\n3. Test getCachedMeta avec ID seulement:');
try {
  const cached2 = await getCachedMeta(null, 'tv', null, null, testId, 'w342');
  console.log(`getCachedMeta (ID only) poster: ${cached2?.poster}`);
} catch (err) {
  console.error('Erreur getCachedMeta (ID only):', err.message);
}

console.log('\n4. Test search vs details:');
try {
  // Forcer un search au lieu d'un details
  const cached3 = await getCachedMeta(null, 'tv', 'The Traitors', '2024', null, 'w342');
  console.log(`getCachedMeta (search only) poster: ${cached3?.poster}`);
} catch (err) {
  console.error('Erreur getCachedMeta (search):', err.message);
}