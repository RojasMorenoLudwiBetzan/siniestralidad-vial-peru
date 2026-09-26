-- ============================================================
-- SINIEX PERÚ · consultas sobre el esquema de siniestralidad
-- Tablas: departamentos, provincias, distritos, siniestros,
--         vehiculos, personas
-- ============================================================

-- ------------------------------------------------------------
-- 0. Verificación rápida
-- ------------------------------------------------------------
SELECT COUNT(*) AS siniestros,
       SUM(cantidad_de_fallecidos) AS fallecidos,
       SUM(cantidad_de_lesionados) AS lesionados
FROM siniestros;


-- ------------------------------------------------------------
-- 1. FILAS DEL TABLERO  (endpoint /api/rows)
--    Una fila por año × departamento × vehículo × causa × zona × mes × franja
-- ------------------------------------------------------------
WITH base AS (
  SELECT
    s.codigo_siniestro,
    EXTRACT(YEAR  FROM s.fecha_siniestro)::int AS anio,
    EXTRACT(MONTH FROM s.fecha_siniestro)::int AS mes,
    LEAST(GREATEST(COALESCE(NULLIF(SPLIT_PART(s.hora_siniestro, ':', 1), '')::int, 0) / 3, 0), 7) AS franja,
    d.departamento AS dep,
    COALESCE(NULLIF(TRIM(s.zona), ''), 'Sin registro') AS zona,
    COALESCE(NULLIF(TRIM(s.causa_factor_principal), ''), 'Otras causas') AS causa,
    COALESCE(s.cantidad_de_fallecidos, 0) AS fallecidos,
    (SELECT COALESCE(NULLIF(TRIM(v.vehiculo), ''), 'Sin registro')
       FROM vehiculos v
      WHERE v.codigo_siniestro = s.codigo_siniestro
      ORDER BY v.codigo_vehiculo LIMIT 1) AS vehiculo
  FROM siniestros s
  JOIN distritos     di ON di.id_distrito    = s.id_distrito
  JOIN provincias    p  ON p.id_provincia    = di.id_provincia
  JOIN departamentos d  ON d.id_departamento = p.id_departamento
  WHERE s.fecha_siniestro IS NOT NULL
)
SELECT anio, dep, vehiculo AS veh, causa AS cau, zona, mes, franja,
       COUNT(*) AS siniestros, SUM(fallecidos) AS fallecidos
FROM base
GROUP BY anio, dep, veh, cau, zona, mes, franja
ORDER BY anio, dep;


-- ------------------------------------------------------------
-- 2. MAPA · agregado por departamento  (endpoint /api/mapa)
-- ------------------------------------------------------------
SELECT UPPER(TRIM(d.departamento)) AS dep,
       COUNT(*) AS siniestros,
       SUM(COALESCE(s.cantidad_de_fallecidos, 0)) AS fallecidos,
       SUM(COALESCE(s.cantidad_de_lesionados, 0)) AS lesionados,
       AVG(s.coordenadas_latitud)  AS lat,
       AVG(s.coordenadas_longitud) AS lng
FROM siniestros s
JOIN distritos     di ON di.id_distrito    = s.id_distrito
JOIN provincias    p  ON p.id_provincia    = di.id_provincia
JOIN departamentos d  ON d.id_departamento = p.id_departamento
GROUP BY 1
ORDER BY 2 DESC;


-- ------------------------------------------------------------
-- 3. MAPA · agregado por provincia y por distrito
-- ------------------------------------------------------------
SELECT UPPER(TRIM(d.departamento)) AS dep, UPPER(TRIM(p.provincia)) AS prov,
       COUNT(*) AS siniestros,
       SUM(COALESCE(s.cantidad_de_fallecidos, 0)) AS fallecidos,
       SUM(COALESCE(s.cantidad_de_lesionados, 0)) AS lesionados,
       AVG(s.coordenadas_latitud) AS lat, AVG(s.coordenadas_longitud) AS lng
FROM siniestros s
JOIN distritos     di ON di.id_distrito    = s.id_distrito
JOIN provincias    p  ON p.id_provincia    = di.id_provincia
JOIN departamentos d  ON d.id_departamento = p.id_departamento
GROUP BY 1, 2
ORDER BY 3 DESC;

SELECT UPPER(TRIM(d.departamento)) AS dep, UPPER(TRIM(p.provincia)) AS prov,
       UPPER(TRIM(di.distrito)) AS dist,
       COUNT(*) AS siniestros,
       SUM(COALESCE(s.cantidad_de_fallecidos, 0)) AS fallecidos,
       SUM(COALESCE(s.cantidad_de_lesionados, 0)) AS lesionados,
       AVG(s.coordenadas_latitud) AS lat, AVG(s.coordenadas_longitud) AS lng
FROM siniestros s
JOIN distritos     di ON di.id_distrito    = s.id_distrito
JOIN provincias    p  ON p.id_provincia    = di.id_provincia
JOIN departamentos d  ON d.id_departamento = p.id_departamento
GROUP BY 1, 2, 3
ORDER BY 4 DESC;


-- ------------------------------------------------------------
-- 4. MAPA · puntos individuales  (endpoint /api/puntos)
-- ------------------------------------------------------------
SELECT s.coordenadas_latitud AS lat, s.coordenadas_longitud AS lng,
       UPPER(TRIM(d.departamento)) AS dep, UPPER(TRIM(p.provincia)) AS prov,
       UPPER(TRIM(di.distrito)) AS dist,
       COALESCE(s.cantidad_de_fallecidos, 0) AS fallecidos,
       COALESCE(s.cantidad_de_lesionados, 0) AS lesionados
FROM siniestros s
JOIN distritos     di ON di.id_distrito    = s.id_distrito
JOIN provincias    p  ON p.id_provincia    = di.id_provincia
JOIN departamentos d  ON d.id_departamento = p.id_departamento
WHERE s.coordenadas_latitud IS NOT NULL
  AND s.coordenadas_longitud IS NOT NULL;


-- ------------------------------------------------------------
-- 5. Indicadores sueltos (por si los necesitas en la sustentación)
-- ------------------------------------------------------------
-- Evolución anual
SELECT EXTRACT(YEAR FROM fecha_siniestro)::int AS anio,
       COUNT(*) AS siniestros,
       SUM(cantidad_de_fallecidos) AS fallecidos
FROM siniestros
GROUP BY 1 ORDER BY 1;

-- Principales causas
SELECT COALESCE(NULLIF(TRIM(causa_factor_principal), ''), 'Otras causas') AS causa,
       COUNT(*) AS siniestros,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS porcentaje
FROM siniestros
GROUP BY 1 ORDER BY 2 DESC;

-- Tipos de vehículo más involucrados
SELECT COALESCE(NULLIF(TRIM(v.vehiculo), ''), 'Sin registro') AS vehiculo,
       COUNT(DISTINCT v.codigo_siniestro) AS siniestros
FROM vehiculos v
GROUP BY 1 ORDER BY 2 DESC;

-- Perfil de las personas fallecidas
SELECT tipo_persona, sexo,
       COUNT(*) FILTER (WHERE gravedad ILIKE '%FALLECID%') AS fallecidos,
       ROUND(AVG(edad)::numeric, 1) AS edad_promedio
FROM personas
GROUP BY 1, 2 ORDER BY 3 DESC NULLS LAST;

-- Franja horaria más crítica
SELECT LEFT(hora_siniestro, 2) AS hora, COUNT(*) AS siniestros
FROM siniestros
WHERE hora_siniestro IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;

-- Tasa por cada 100 mil habitantes (reemplaza la población si tienes la tabla)
SELECT d.departamento,
       SUM(COALESCE(s.cantidad_de_fallecidos, 0)) AS fallecidos
FROM siniestros s
JOIN distritos     di ON di.id_distrito    = s.id_distrito
JOIN provincias    p  ON p.id_provincia    = di.id_provincia
JOIN departamentos d  ON d.id_departamento = p.id_departamento
GROUP BY 1 ORDER BY 2 DESC;
