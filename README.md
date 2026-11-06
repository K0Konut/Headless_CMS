# Dashility

CMS headless auto-hébergé : le contenu et l'audience de plusieurs sites, depuis un seul dashboard.

La documentation du projet est dans [`docs/`](docs/).

## Développement

```sh
npm ci
npm run db     # PostgreSQL local (Docker)
npm run dev    # API sur :3000 ; le dashboard : npm run dev -w @dashility/dashboard
```

## Mise en ligne

Chaque merge sur `main` relance les vérifications, puis publie l'image `ghcr.io/k0konut/dashility` (`latest` et l'empreinte du commit). Le serveur la récupère tout seul : GitHub n'y a aucun accès.

### Installation sur le serveur (une seule fois)

1. Après la première publication, sur GitHub : **Packages → dashility → Package settings → Change visibility → Public**, pour que le serveur télécharge l'image sans jeton.
2. Sur le serveur, vérifier que le NAS accepte l'écriture (NFS peut refuser l'utilisateur root des conteneurs) :

   ```sh
   mkdir -p /mnt/nas/media/backups/dashility
   docker run --rm -v /mnt/nas/media/backups/dashility:/b postgres:17 touch /b/test && echo OK
   ```

   Si la commande échoue, autoriser l'écriture sur ce dossier côté NAS (réglages NFS ou droits du dossier). Le fichier `test` peut ensuite être supprimé.

3. Préparer le dossier :

   ```sh
   mkdir -p /srv/docker/Projects/dashility && cd /srv/docker/Projects/dashility
   # docker/compose.prod.yml du dépôt, copié ici sous le nom compose.yml
   echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env && chmod 600 .env
   docker compose up -d
   ```

4. Créer le super-admin (le mot de passe est demandé dans le terminal) :

   ```sh
   docker compose exec app node dist/cli.js create-super-admin <email>
   ```

5. Dans Nginx Proxy Manager : un Proxy Host `dashility.costamask.dev` vers `dashility-app`, port `3000`, avec un certificat Let's Encrypt, **Force SSL** et **HSTS** (le cookie de session n'est envoyé qu'en HTTPS).
6. Mise à jour automatique, dans la crontab de l'utilisateur qui gère Docker (`crontab -e`) :

   ```cron
   */5 * * * * cd /srv/docker/Projects/dashility && docker compose up -d --pull always --quiet-pull 2>&1 | logger -t dashility-deploy
   ```

   Journal : `journalctl -t dashility-deploy`.

### Au quotidien

- **Retour arrière** : ajouter `IMAGE_TAG=<empreinte du commit>` dans `.env`, puis `docker compose up -d`. Retirer la ligne pour revenir à `latest`.
- **`compose.prod.yml` modifié** : le recopier à la main dans le dossier du serveur.
- **Sauvegardes** : un `pg_dump` au démarrage puis toutes les 24 h dans `/mnt/nas/media/backups/dashility`, en gardant les 7 plus récents (`docker compose logs backup`). Restauration :

  ```sh
  docker compose exec -T db pg_restore -U dashility -d dashility --clean --if-exists < /mnt/nas/media/backups/dashility/dashility-AAAA-MM-JJ.dump
  ```
