# Installation et utilisation avec Docker

**🌐 Languages:** [Français](#-français) | [English](#-english)

---

## 🇫🇷 Français

Ce guide explique comment utiliser **Trakt Enhanced** avec Docker.

## 📦 Image Docker

L'image Docker officielle est disponible sur Docker Hub :
```
docker.io/diabolino/trakt_enhanced:latest
```

## 🚀 Démarrage rapide

**Plus besoin de créer manuellement le fichier `.env` !**

1. **Lancer le conteneur** :
```bash
docker run -d \
    --name=trakt_enhanced \
    -p 30009:30009 \
    -v ~/trakt_enhanced/data:/app/data \
    -v ~/trakt_enhanced/config:/app/config \
    --restart unless-stopped \
    docker.io/diabolino/trakt_enhanced:latest
```

2. **Ouvrir votre navigateur** sur `http://localhost:30009`
   - L'application vous redirigera automatiquement vers la page de configuration
   - Remplissez le formulaire avec vos API keys (Trakt et TMDB)
   - Le fichier `.env` sera généré automatiquement

3. **C'est tout !** L'application redémarre et est prête à l'emploi.

## ⚙️ Prérequis - Permissions

**Important** : Créez les dossiers avec les bonnes permissions avant le premier lancement :

```bash
# Créer les dossiers
mkdir -p ~/trakt_enhanced/{data,config}

# Définir les bonnes permissions (UID/GID 99:100)
sudo chown -R 99:100 ~/trakt_enhanced

# Alternative si vous n'avez pas sudo : utiliser votre utilisateur
chown -R $USER:$USER ~/trakt_enhanced
```

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
-v ~/trakt_enhanced/data:/app/data
```
Stocke :
- Cache des données Trakt
- Tokens d'authentification
- Logs de l'application
- Cache des images et métadonnées

### Dossier de configuration (obligatoire)
```bash
-v ~/trakt_enhanced/config:/app/config
```
Monte votre dossier de configuration local dans le conteneur. Le fichier `.env` y sera créé automatiquement. **Non nécessaire** si vous utilisez la configuration via l'interface web.

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
    image: docker.io/diabolino/trakt_enhanced:latest
    container_name: trakt_enhanced
    restart: unless-stopped
    ports:
      - "30009:30009"
    volumes:
      - ./trakt_enhanced/data:/app/data
      - ./trakt_enhanced/config:/app/config
    environment:
      - TZ=Europe/Paris
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
docker logs -f trakt_enhanced
```

### Accès au conteneur
```bash
docker exec -it trakt_enhanced sh
```

## ⚡ Mise à jour

1. **Arrêter le conteneur** :
```bash
docker stop trakt_enhanced
docker rm trakt_enhanced
```

2. **Télécharger la nouvelle image** :
```bash
docker pull docker.io/diabolino/trakt_enhanced:latest
```

3. **Relancer** avec la même commande qu'avant

## 🛠️ Dépannage

### L'application ne démarre pas
- Vérifiez les logs : `docker logs trakt_enhanced`
- Vérifiez que le port 30009 n'est pas déjà utilisé
- Si vous montez un dossier config manuel, le fichier .env y sera créé automatiquement

### Problèmes de permissions
- Le conteneur utilise l'utilisateur `app` (UID 1000)
- Les volumes sont automatiquement configurés

### Réinitialisation complète
```bash
docker stop trakt_enhanced
docker rm trakt_enhanced
# Plus besoin de supprimer de volumes nommés - les dossiers restent sur l'hôte
# Puis relancer normalement
```

## 🔗 Liens utiles

- [Docker Hub](https://hub.docker.com/r/diabolino/trakt_enhanced)
- [Documentation Trakt API](https://trakt.docs.apiary.io/)
- [Clé API TMDB](https://www.themoviedb.org/settings/api)

---

## 🇺🇸 English

This guide explains how to use **Trakt Enhanced** with Docker.

## 📦 Docker Image

The official Docker image is available on Docker Hub:
```
docker.io/diabolino/trakt_enhanced:latest
```

## 🚀 Quick Start

**No need to manually create the `.env` file anymore!**

1. **Launch the container**:
```bash
docker run -d \
    --name=trakt_enhanced \
    -p 30009:30009 \
    -v ~/trakt_enhanced/data:/app/data \
    -v ~/trakt_enhanced/config:/app/config \
    --restart unless-stopped \
    docker.io/diabolino/trakt_enhanced:latest
```

2. **Open your browser** to `http://localhost:30009`
   - The application will automatically redirect you to the configuration page
   - Fill the form with your API keys (Trakt and TMDB)
   - The `.env` file will be generated automatically

3. **That's it!** The application restarts and is ready to use.

## ⚙️ Prerequisites - Permissions

**Important**: Create folders with proper permissions before first launch:

```bash
# Create folders
mkdir -p ~/trakt_enhanced/{data,config}

# Set proper permissions (UID/GID 99:100)
sudo chown -R 99:100 ~/trakt_enhanced

# Alternative if you don't have sudo: use your user
chown -R $USER:$USER ~/trakt_enhanced
```

## 🔧 Configuration

### Configuration via web interface (recommended)

Since version 2.0, **Trakt Enhanced** has an automatic web configuration interface:

1. At first startup, the application redirects you to `/setup`
2. Fill the form with your API keys
3. The `.env` file is generated automatically
4. The application restarts and is ready

### Manual configuration (optional)

If you prefer to manually create the `.env` file, you can still do so:

**Required variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `TRAKT_CLIENT_ID` | Client ID of your Trakt app | `abc123...` |
| `TRAKT_CLIENT_SECRET` | Client secret of your Trakt app | `def456...` |
| `TMDB_API_KEY` | TMDB API key for metadata | `ghi789...` |
| `LANGUAGE` | TMDB language for metadata | `en-US` |
| `FULL_REBUILD_PASSWORD` | Password for complete rebuild | `rebuild123` |

### Optional environment variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PORT` | Application listening port | `30009` | `30009` |
| `TZ` | Timezone | `UTC` | `Europe/Paris` |
| `SESSION_SECRET` | Secret for sessions (auto-generated if missing) | auto | `my_random_secret` |
| `FULL_REBUILD_PASSWORD` | Password for complete rebuild | - | `rebuild123` |
| `REFRESH_EVERY_MS` | Auto refresh interval (ms) | `3600000` | `1800000` |

## 🗂️ Volumes

### Data volume (mandatory)
```bash
-v ~/trakt_enhanced/data:/app/data
```
Stores:
- Trakt data cache
- Authentication tokens
- Application logs
- Image and metadata cache

### Configuration folder (mandatory)
```bash
-v ~/trakt_enhanced/config:/app/config
```
Mounts your local configuration folder into the container. The `.env` file will be created automatically there. **Not necessary** if you use configuration via web interface.

## 🌐 Ports

By default, the application listens on port 30009. You can:

- **Standard port**: `-p 30009:30009` → `http://localhost:30009`
- **Custom port**: `-p 8080:30009` → `http://localhost:8080`
- **Port in .env**: If `PORT=3001` in your .env, use `-p 3001:3001`

## 🔄 Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  trakt:
    image: docker.io/diabolino/trakt_enhanced:latest
    container_name: trakt_enhanced
    restart: unless-stopped
    ports:
      - "30009:30009"
    volumes:
      - ./trakt_enhanced/data:/app/data
      - ./trakt_enhanced/config:/app/config
    environment:
      - TZ=Europe/Paris
```

Then launch:
```bash
docker-compose up -d
```

## 🏥 Monitoring and Health

### Health Check
The image includes an automatic health check:
```bash
docker ps  # Check "healthy" status
```

### Logs
```bash
docker logs -f trakt_enhanced
```

### Container access
```bash
docker exec -it trakt_enhanced sh
```

## ⚡ Update

1. **Stop the container**:
```bash
docker stop trakt_enhanced
docker rm trakt_enhanced
```

2. **Download the new image**:
```bash
docker pull docker.io/diabolino/trakt_enhanced:latest
```

3. **Restart** with the same command as before

## 🛠️ Troubleshooting

### Application won't start
- Check logs: `docker logs trakt_enhanced`
- Verify port 30009 is not already in use
- If you mount a manual config folder, the .env file will be created automatically there

### Permission issues
- The container uses the `app` user (UID 1000)
- Volumes are automatically configured

### Complete reset
```bash
docker stop trakt_enhanced
docker rm trakt_enhanced
# No need to delete named volumes - folders remain on host
# Then restart normally
```

## 🔗 Useful Links

- [Docker Hub](https://hub.docker.com/r/diabolino/trakt_enhanced)
- [Trakt API Documentation](https://trakt.docs.apiary.io/)
- [TMDB API Key](https://www.themoviedb.org/settings/api)
