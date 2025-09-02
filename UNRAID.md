# Configuration Unraid pour Trakt Enhanced

## Volumes à mapper obligatoirement

Pour conserver vos données et configuration entre les mises à jour, vous devez mapper ces volumes dans Unraid :

### 1. Données persistantes
- **Conteneur**: `/app/data`  
- **Hôte**: `/mnt/user/appdata/trakt-enhanced/data`
- **Type**: Lecture/Écriture (RW)
- **Description**: Cache Trakt/TMDB, sessions, tokens d'authentification, cache d'images

### 2. Configuration (.env)
- **Conteneur**: `/app/.env`
- **Hôte**: `/mnt/user/appdata/trakt-enhanced/.env`
- **Type**: Lecture/Écriture (RW)  
- **Description**: Configuration de l'application (clés API, secrets)

## Configuration Unraid complète

```yaml
# Configuration Container dans Unraid
Name: trakt-enhanced
Repository: diabolino/trakt_enhanced:latest
Network Type: bridge

# Variables d'environnement optionnelles
- PORT: 30009 (par défaut)
- NODE_ENV: production
- TZ: Europe/Paris (votre timezone)
- PUBLIC_HOST: http://votre-ip:30009 (pour OAuth Trakt)

# Ports
- Container Port: 30009
- Host Port: 30009
- Protocol: TCP

# Volumes (OBLIGATOIRES pour persistance)
- Container Path: /app/data
  Host Path: /mnt/user/appdata/trakt-enhanced/data
  Access Mode: Read/Write

- Container Path: /app/.env  
  Host Path: /mnt/user/appdata/trakt-enhanced/.env
  Access Mode: Read/Write
```

## Configuration initiale

1. **Premier démarrage** : Accédez à `http://votre-ip:30009`
2. **Configuration** : L'interface vous guidera pour configurer vos clés API
3. **Après configuration** : Le fichier `.env` sera créé automatiquement

## Mise à jour

Avec cette configuration, vos données et paramètres persisteront lors des mises à jour :
- Arrêtez le conteneur
- Mettez à jour vers la nouvelle image
- Redémarrez → Configuration et données conservées ✅

## Troubleshooting

### Permissions
Si vous avez des erreurs de permissions :
```bash
# Depuis Unraid terminal
chown -R 99:100 /mnt/user/appdata/trakt-enhanced/
```

### Backup recommandé  
```bash
# Sauvegarder la configuration
cp /mnt/user/appdata/trakt-enhanced/.env /mnt/user/appdata/trakt-enhanced/.env.backup

# Sauvegarder les données
tar -czf trakt-enhanced-backup.tar.gz /mnt/user/appdata/trakt-enhanced/
```