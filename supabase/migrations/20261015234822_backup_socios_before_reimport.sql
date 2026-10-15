/*
# Copia de respaldo de socios antes de reimportar

1. Nueva tabla
- `socios_backup_20261015`: copia exacta de todos los socios existentes antes de limpiar la tabla
  para importar el padrón actualizado. Solo sirve como respaldo.

2. Seguridad
- RLS activado y sin políticas: la app no puede leerla ni modificarla (solo el administrador de la base).
*/

CREATE TABLE IF NOT EXISTS socios_backup_20261015 AS SELECT * FROM socios WITH NO DATA;

INSERT INTO socios_backup_20261015
SELECT s.* FROM socios s
WHERE NOT EXISTS (SELECT 1 FROM socios_backup_20261015 b WHERE b.id = s.id);

ALTER TABLE socios_backup_20261015 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON socios_backup_20261015 FROM anon, authenticated;
