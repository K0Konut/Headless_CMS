-- Les pages uniques créées avant la table des entrées reçoivent leur entrée, vide. « EN complet »
-- est recalculé à la première sauvegarde.
INSERT INTO "entries" ("type_id", "draft", "en_complete")
SELECT "id", '{}'::jsonb, false
FROM "content_types" t
WHERE t."kind" = 'single'
  AND NOT EXISTS (SELECT 1 FROM "entries" e WHERE e."type_id" = t."id");
