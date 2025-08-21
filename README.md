# Guide de Démarrage

## Prérequis
- [Deno](https://deno.land/) installé
- [Docker](https://www.docker.com/) installé

## Installation et Configuration

### 1. Base de Données
```bash
# Lancement des services Docker
./docker-setup.sh

# Connexion à MySQL
mysql -h 127.0.0.1 -P 3306 -u root -p
# Mot de passe : mypassword
```

### 2. Backend (Main)
```bash
deno run --allow-net --allow-env --allow-read main.ts
```

### 3. Frontend
```bash
deno run --allow-net --allow-env --allow-read server.ts
```

## Informations de Connexion
- **Base de données** : MySQL sur localhost:3306
- **Utilisateur** : root
- **Mot de passe** : mypassword