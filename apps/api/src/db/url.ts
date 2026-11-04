// Valeur par défaut = base locale de docker/compose.yml (identifiants de dev, pas un secret).
export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://dashility:dashility@localhost:5432/dashility'
