# Installation et utilisation avec Docker

Ce guide explique comment utiliser **Trakt Enhanced** avec Docker.

## 📦 Image Docker

L'image Docker officielle est disponible sur Docker Hub :
```
docker.io/diabolino/trakt_enchanced:latest
```

## 🚀 Démarrage rapide

**Plus besoin de créer manuellement le fichier `.env` !**

1. **Lancer le conteneur** :
```bash
docker run -d \
    --name=trakt_enchanced \
    -p 30009:30009 \
    -v trakt_data:/app/data \
    --restart unless-stopped \
    docker.io/diabolino/trakt_enchanced:latest
```

2. **Ouvrir votre navigateur** sur `http://localhost:30009`
   - L'application vous redirigera automatiquement vers la page de configuration
   - Remplissez le formulaire avec vos API keys (Trakt et TMDB)
   - Le fichier `.env` sera généré automatiquement

3. **C'est tout !** L'application redémarre et est prête à l'emploi.

## 🔧 Configuration

### Configuration via interface web (recommandée)

Depuis la version 2.0, **Trakt Enhanced** dispose d'une interface de configuration web automatique :

1. Au premier démarrage, l'application vous redirige vers `/setup`
2. Remplissez le formulaire avec vos API keys
3. Le fichier `.env` est généré automatiquement
4. L'application redémarre et est prête

### Configuration manuelle (optionnelle)

Si vous préférez créer manuellement le fichier `.env`, vous pouvez toujours le faire :

**Variables obligatoires :**

| Variable | Description | Exemple |
|----------|-------------|---------|
| `TRAKT_CLIENT_ID` | ID client de votre app Trakt | `abc123...` |
| `TRAKT_CLIENT_SECRET` | Secret client de votre app Trakt | `def456...` |
| `TMDB_API_KEY` | Clé API TMDB pour les métadonnées | `ghi789...` |
| `FULL_REBUILD_PASSWORD` | Mot de passe pour rebuild complet | `rebuild123` |

### Variables d'environnement optionnelles

| Variable | Description | Défaut | Exemple |
|----------|-------------|--------|---------|
| `PORT` | Port d'écoute de l'application | `30009` | `30009` |
| `TZ` | Fuseau horaire | `UTC` | `Europe/Paris` |
| `SESSION_SECRET` | Secret pour les sessions (généré auto si absent) | auto | `mon_secret_aleatoire` |
| `FULL_REBUILD_PASSWORD` | Mot de passe pour le rebuild complet | - | `rebuild123` |
| `REFRESH_EVERY_MS` | Intervalle de refresh auto (ms) | `3600000` | `1800000` |

## 🗂️ Volumes

### Volume de données (obligatoire)
```bash
-v trakt_data:/app/data
```
Stocke :
- Cache des données Trakt
- Tokens d'authentification
- Logs de l'application
- Cache des images et métadonnées

### Fichier de configuration (optionnel)
```bash
-v ~/trakt/.env:/app/.env:ro
```
Monte votre fichier `.env` local dans le conteneur. **Non nécessaire** si vous utilisez la configuration via l'interface web.

## 🌐 Ports

Par défaut, l'application écoute sur le port 30009. Vous pouvez :

- **Port standard** : `-p 30009:30009` → `http://localhost:30009`
- **Port personnalisé** : `-p 8080:30009` → `http://localhost:8080`
- **Port dans .env** : Si `PORT=3001` dans votre .env, utilisez `-p 3001:3001`

## 🔄 Docker Compose

Créez un fichier `docker-compose.yml` :

```yaml
version: '3.8'
services:
  trakt:
    image: docker.io/diabolino/trakt_enchanced:latest
    container_name: trakt_enchanced
    restart: unless-stopped
    ports:
      - "30009:30009"
    volumes:
      # Le volume .env est optionnel avec la configuration web
      # - ./trakt.env:/app/.env:ro
      - trakt_data:/app/data
    environment:
      - TZ=Europe/Paris

volumes:
  trakt_data:
```

Puis lancez :
```bash
docker-compose up -d
```

## 🏥 Surveillance et santé

### Health Check
L'image inclut un health check automatique :
```bash
docker ps  # Vérifie l'état "healthy"
```

### Logs
```bash
docker logs -f trakt_enchanced
```

### Accès au conteneur
```bash
docker exec -it trakt_enchanced sh
```

## ⚡ Mise à jour

1. **Arrêter le conteneur** :
```bash
docker stop trakt_enchanced
docker rm trakt_enchanced
```

2. **Télécharger la nouvelle image** :
```bash
docker pull docker.io/diabolino/trakt_enchanced:latest
```

3. **Relancer** avec la même commande qu'avant

## 🛠️ Dépannage

### L'application ne démarre pas
- Vérifiez les logs : `docker logs trakt_enchanced`
- Vérifiez que le port 30009 n'est pas déjà utilisé
- Si vous montez un .env manuel, vérifiez qu'il contient les variables obligatoires

### Problèmes de permissions
- Le conteneur utilise l'utilisateur `app` (UID 1000)
- Les volumes sont automatiquement configurés

### Réinitialisation complète
```bash
docker stop trakt_enchanced
docker rm trakt_enchanced
docker volume rm trakt_data
# Puis relancer normalement
```

## 🔗 Liens utiles

- [Docker Hub](https://hub.docker.com/r/diabolino/trakt_enchanced)
- [Documentation Trakt API](https://trakt.docs.apiary.io/)
- [Clé API TMDB](https://www.themoviedb.org/settings/api)