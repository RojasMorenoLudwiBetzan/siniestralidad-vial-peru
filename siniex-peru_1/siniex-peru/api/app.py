#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SINIEX PERU - API que conecta la web con PostgreSQL.

Instalacion:
    pip install -r requirements.txt
    copia .env.example a .env y pon tus credenciales
    python app.py

Endpoints:
    GET /api/health   estado de la conexion y conteos
    GET /api/filtros  anios, departamentos, vehiculos y causas
    GET /api/rows     filas agregadas que alimentan todo el tablero
    GET /api/mapa     siniestros y fallecidos por departamento
    GET /api/puntos   coordenadas de cada siniestro (para el mapa)
    GET /api/reporte  mismo detalle que /api/rows en formato tabla
"""
import os
from flask import Flask, jsonify, request
import psycopg2
import psycopg2.extras

# ---------- carga de .env (sin dependencias externas) ----------
def cargar_env():
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(ruta):
        return
    with open(ruta, encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

cargar_env()

CONF = {
    "host":     os.getenv("PGHOST", "localhost"),
    "port":     int(os.getenv("PGPORT", "5432")),
    "dbname":   os.getenv("PGDATABASE", "siniex"),
    "user":     os.getenv("PGUSER", "postgres"),
    "password": os.getenv("PGPASSWORD", ""),
}
ESQUEMA = os.getenv("PGSCHEMA", "public")
PUERTO_API = int(os.getenv("API_PORT", "5000"))

# poblacion por departamento (proyeccion INEI) para calcular la tasa /100k
POBLACION = {
    "AMAZONAS": 433000, "ANCASH": 1180000, "APURIMAC": 430000, "AREQUIPA": 1497000,
    "AYACUCHO": 668000, "CAJAMARCA": 1453000, "CALLAO": 1129000, "CUSCO": 1357000,
    "HUANCAVELICA": 366000, "HUANUCO": 760000, "ICA": 975000, "JUNIN": 1361000,
    "LA LIBERTAD": 2050000, "LAMBAYEQUE": 1310000, "LIMA": 10628470, "LORETO": 1030000,
    "MADRE DE DIOS": 173000, "MOQUEGUA": 192000, "PASCO": 273000, "PIURA": 2047000,
    "PUNO": 1237000, "SAN MARTIN": 900000, "TACNA": 371000, "TUMBES": 251000,
    "UCAYALI": 600000,
}

HORAS = ["00-03", "03-06", "06-09", "09-12", "12-15", "15-18", "18-21", "21-24"]

app = Flask(__name__)


@app.after_request
def cors(resp):
    """Permite que la web (file:// o localhost:8000) consulte esta API."""
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return resp


def conectar():
    cn = psycopg2.connect(**CONF)
    with cn.cursor() as cur:
        cur.execute("SET search_path TO %s, public;" % ESQUEMA)
    return cn


def consultar(sql, params=None):
    cn = conectar()
    try:
        with cn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return [dict(r) for r in cur.fetchall()]
    finally:
        cn.close()


def titulo(texto):
    """LA LIBERTAD -> La Libertad"""
    menores = {"de", "del", "la", "y"}
    palabras = (texto or "").strip().lower().split()
    return " ".join(p if p in menores and i else p.capitalize() for i, p in enumerate(palabras))


# ------------------------------------------------------------------ health
@app.route("/api/health")
def health():
    try:
        cn = conectar()
        with cn.cursor() as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()[0].split(",")[0]
            conteos = {}
            for tabla in ("siniestros", "personas", "vehiculos", "distritos"):
                try:
                    cur.execute("SELECT COUNT(*) FROM %s;" % tabla)
                    conteos[tabla] = cur.fetchone()[0]
                except Exception:
                    cn.rollback()
                    conteos[tabla] = 0
        cn.close()
        return jsonify({
            "ok": True, "version": version, "host": CONF["host"], "base": CONF["dbname"],
            "esquema": ESQUEMA,
            "siniestros": conteos.get("siniestros", 0),
            "personas": conteos.get("personas", 0),
            "vehiculos": conteos.get("vehiculos", 0),
            "distritos": conteos.get("distritos", 0),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e), "host": CONF["host"], "base": CONF["dbname"]}), 500


# ----------------------------------------------------------------- filtros
SQL_FILTROS_ANIOS = """
SELECT DISTINCT EXTRACT(YEAR FROM s.fecha_siniestro)::int AS anio
FROM siniestros s WHERE s.fecha_siniestro IS NOT NULL ORDER BY 1;
"""

SQL_FILTROS_DEP = """
SELECT d.departamento AS dep, COUNT(*) AS n
FROM siniestros s
JOIN distritos    di ON di.id_distrito     = s.id_distrito
JOIN provincias   p  ON p.id_provincia     = di.id_provincia
JOIN departamentos d ON d.id_departamento  = p.id_departamento
GROUP BY 1 ORDER BY 1;
"""


@app.route("/api/filtros")
def filtros():
    try:
        anios = [r["anio"] for r in consultar(SQL_FILTROS_ANIOS)]
        deps = [titulo(r["dep"]) for r in consultar(SQL_FILTROS_DEP)]
        vehs = [r["vehiculo"] for r in consultar(
            "SELECT DISTINCT vehiculo FROM vehiculos WHERE vehiculo IS NOT NULL ORDER BY 1;")]
        caus = [r["causa"] for r in consultar(
            "SELECT DISTINCT causa_factor_principal AS causa FROM siniestros "
            "WHERE causa_factor_principal IS NOT NULL ORDER BY 1;")]
        return jsonify({"ok": True, "anios": anios, "departamentos": deps,
                        "vehiculos": vehs, "causas": caus})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# -------------------------------------------------------------------- rows
# Una fila por combinacion (anio, departamento, vehiculo, causa, zona, mes, franja).
# Es exactamente lo que consume el tablero: KPIs, ranking, graficos y reportes.
SQL_ROWS = """
WITH base AS (
  SELECT
    s.codigo_siniestro,
    EXTRACT(YEAR  FROM s.fecha_siniestro)::int          AS anio,
    EXTRACT(MONTH FROM s.fecha_siniestro)::int          AS mes,
    LEAST(GREATEST(
      COALESCE(NULLIF(SPLIT_PART(s.hora_siniestro, ':', 1), '')::int, 0) / 3, 0), 7) AS franja,
    d.departamento                                      AS dep,
    COALESCE(NULLIF(TRIM(s.zona), ''), 'Sin registro')  AS zona,
    COALESCE(NULLIF(TRIM(s.causa_factor_principal), ''), 'Otras causas') AS causa,
    COALESCE(s.cantidad_de_fallecidos, 0)               AS fallecidos,
    (SELECT COALESCE(NULLIF(TRIM(v.vehiculo), ''), 'Sin registro')
       FROM vehiculos v
      WHERE v.codigo_siniestro = s.codigo_siniestro
      ORDER BY v.codigo_vehiculo
      LIMIT 1)                                          AS vehiculo
  FROM siniestros s
  JOIN distritos     di ON di.id_distrito    = s.id_distrito
  JOIN provincias    p  ON p.id_provincia    = di.id_provincia
  JOIN departamentos d  ON d.id_departamento = p.id_departamento
  WHERE s.fecha_siniestro IS NOT NULL
)
SELECT anio, dep,
       COALESCE(vehiculo, 'Sin registro') AS veh,
       causa AS cau, zona, mes, franja,
       COUNT(*)          AS siniestros,
       SUM(fallecidos)   AS fallecidos
FROM base
GROUP BY anio, dep, veh, cau, zona, mes, franja
ORDER BY anio, dep;
"""


@app.route("/api/rows")
def rows():
    try:
        filas = consultar(SQL_ROWS)
        out, deps, anios, vehs, caus = [], {}, set(), set(), set()
        for f in filas:
            dep = titulo(f["dep"])
            clave = (f["dep"] or "").strip().upper()
            deps.setdefault(clave, dep)
            anios.add(f["anio"]); vehs.add(f["veh"]); caus.add(f["cau"])
            out.append({
                "anio": f["anio"], "dep": dep, "veh": f["veh"], "cau": f["cau"],
                "zona": f["zona"], "mes": f["mes"],
                "hora": HORAS[min(max(int(f["franja"] or 0), 0), 7)],
                "sin": int(f["siniestros"]), "fal": int(f["fallecidos"] or 0),
            })
        departamentos = [{"nombre": v, "clave": k, "poblacion": POBLACION.get(k, 500000)}
                         for k, v in sorted(deps.items())]
        return jsonify({
            "ok": True, "rows": out,
            "departamentos": departamentos,
            "poblacionNacional": sum(d["poblacion"] for d in departamentos),
            "anios": sorted(anios),
            "vehiculos": sorted(vehs),
            "causas": sorted(caus),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# -------------------------------------------------------------------- mapa
SQL_MAPA = """
SELECT UPPER(TRIM(d.departamento))                AS dep,
       COUNT(*)                                   AS siniestros,
       SUM(COALESCE(s.cantidad_de_fallecidos, 0)) AS fallecidos,
       SUM(COALESCE(s.cantidad_de_lesionados, 0)) AS lesionados,
       AVG(s.coordenadas_latitud)                 AS lat,
       AVG(s.coordenadas_longitud)                AS lng
FROM siniestros s
JOIN distritos     di ON di.id_distrito    = s.id_distrito
JOIN provincias    p  ON p.id_provincia    = di.id_provincia
JOIN departamentos d  ON d.id_departamento = p.id_departamento
GROUP BY 1 ORDER BY 2 DESC;
"""


@app.route("/api/mapa")
def mapa():
    try:
        return jsonify({"ok": True, "departamentos": consultar(SQL_MAPA)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


SQL_PUNTOS = """
SELECT s.coordenadas_latitud  AS lat,
       s.coordenadas_longitud AS lng,
       UPPER(TRIM(d.departamento)) AS dep,
       UPPER(TRIM(p.provincia))    AS prov,
       UPPER(TRIM(di.distrito))    AS dist,
       COALESCE(s.cantidad_de_fallecidos, 0) AS fallecidos,
       COALESCE(s.cantidad_de_lesionados, 0) AS lesionados
FROM siniestros s
JOIN distritos     di ON di.id_distrito    = s.id_distrito
JOIN provincias    p  ON p.id_provincia    = di.id_provincia
JOIN departamentos d  ON d.id_departamento = p.id_departamento
WHERE s.coordenadas_latitud IS NOT NULL
  AND s.coordenadas_longitud IS NOT NULL
LIMIT %s;
"""


@app.route("/api/puntos")
def puntos():
    try:
        limite = int(request.args.get("limite", 20000))
        return jsonify({"ok": True, "puntos": consultar(SQL_PUNTOS, (limite,))})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/reporte")
def reporte():
    return rows()


@app.route("/")
def raiz():
    return jsonify({
        "servicio": "SINIEX PERU API",
        "base": CONF["dbname"], "host": CONF["host"],
        "endpoints": ["/api/health", "/api/filtros", "/api/rows", "/api/mapa", "/api/puntos"],
    })


if __name__ == "__main__":
    print("SINIEX API -> http://localhost:%d" % PUERTO_API)
    print("Base: %s@%s:%s/%s (esquema %s)" % (CONF["user"], CONF["host"], CONF["port"], CONF["dbname"], ESQUEMA))
    app.run(host="0.0.0.0", port=PUERTO_API, debug=True)
