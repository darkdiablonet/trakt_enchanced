#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const packageJsonPath = join(process.cwd(), 'package.json');
const dockerfilePath = join(process.cwd(), 'Dockerfile');

try {
  // Lire la version du package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  
  console.log(`🔄 Mise à jour du Dockerfile vers la version ${version}`);
  
  // Lire le Dockerfile
  let dockerfileContent = readFileSync(dockerfilePath, 'utf8');
  
  // Remplacer la version dans le Dockerfile
  dockerfileContent = dockerfileContent.replace(
    /LABEL org\.opencontainers\.image\.version="[^"]+"/,
    `LABEL org.opencontainers.image.version="${version}"`
  );
  
  // Écrire le Dockerfile mis à jour
  writeFileSync(dockerfilePath, dockerfileContent);
  
  console.log(`✅ Version ${version} mise à jour dans le Dockerfile`);
  
} catch (error) {
  console.error('❌ Erreur lors de la mise à jour:', error.message);
  process.exit(1);
}