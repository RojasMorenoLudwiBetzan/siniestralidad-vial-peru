#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SINIEX PERU - generador de datos y empaquetado del sitio en ZIP.

Qué hace:
  1. Lee los datos reales del mapa (data/agg_departamento.json, siniestros_puntos.json).
  2. Genera js/data.js  -> datos del tablero (año, departamento, vehículo, causa, zona, mes, hora).
  3. Genera data/*.js   -> geojson y agregados del mapa envueltos en JS
                           (para que el sitio funcione con doble clic, sin servidor).
  4. Empaqueta todo en siniex-peru.zip

Uso:  python build.py
"""
import json, os, random, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
random.seed(20250912)

# ---------------- parametros base ----------------
ANIOS = [2021, 2022, 2023, 2024, 2025]
SERIE_ANUAL = {2021: 2392, 2022: 2480, 2023: 2001, 2024: 1555, 2025: 678}

# nombre en el mapa (MAYUSCULAS) -> nombre mostrado + poblacion (proyeccion INEI)
DEPARTAMENTOS = {
    "AMAZONAS":      ("Amazonas",        433000),
    "ANCASH":        ("Áncash",         1180000),
    "APURIMAC":      ("Apurímac",        430000),
    "AREQUIPA":      ("Arequipa",       1497000),
    "AYACUCHO":      ("Ayacucho",        668000),
    "CAJAMARCA":     ("Cajamarca",      1453000),
    "CALLAO":        ("Callao",         1129000),
    "CUSCO":         ("Cusco",          1357000),
    "HUANCAVELICA":  ("Huancavelica",    366000),
    "HUANUCO":       ("Huánuco",         760000),
    "ICA":           ("Ica",             975000),
    "JUNIN":         ("Junín",          1361000),
    "LA LIBERTAD":   ("La Libertad",    2050000),
    "LAMBAYEQUE":    ("Lambayeque",     1310000),
    "LIMA":          ("Lima",          10628470),
    "LORETO":        ("Loreto",         1030000),
    "MADRE DE DIOS": ("Madre de Dios",   173000),
    "MOQUEGUA":      ("Moquegua",        192000),
    "PASCO":         ("Pasco",           273000),
    "PIURA":         ("Piura",          2047000),
    "PUNO":          ("Puno",           1237000),
    "SAN MARTIN":    ("San Martín",      900000),
    "TACNA":         ("Tacna",           371000),
    "TUMBES":        ("Tumbes",          251000),
    "UCAYALI":       ("Ucayali",         600000),
}

VEHICULOS = ["Automóvil", "Camioneta", "Motocicleta", "Mototaxi", "Ómnibus", "Camión", "Bicicleta / Otro"]
PESO_VEH  = [0.27, 0.16, 0.24, 0.09, 0.08, 0.11, 0.05]

CAUSAS = [
    "En proceso de investigación",
    "Imprudencia del conductor",
    "Imprudencia del peatón",
    "Negligencia del conductor",
    "Otras causas",
]
PESO_CAU = [0.506, 0.384, 0.065, 0.026, 0.019]

ZONAS = ["Urbana", "Rural"]
PESO_ZONA = [0.63, 0.37]

PESO_MES  = [.085,.078,.082,.080,.083,.079,.088,.084,.081,.086,.087,.087]
HORAS     = ["00-03","03-06","06-09","09-12","12-15","15-18","18-21","21-24"]
PESO_HORA = [.09,.07,.12,.13,.14,.15,.16,.14]


# ---------------- utilidades ----------------
def reparto(total, pesos):
    """Reparte 'total' entero segun 'pesos' usando mayores restos (suma exacta)."""
    s = float(sum(pesos)) or 1.0
    crudo = [total * p / s for p in pesos]
    base = [int(x) for x in crudo]
    falta = total - sum(base)
    orden = sorted(range(len(pesos)), key=lambda i: crudo[i] - base[i], reverse=True)
    for i in range(falta):
        base[orden[i % len(orden)]] += 1
    return base


def ajustar_columnas(matriz, objetivo_col):
    """Corrige las sumas por columna moviendo unidades dentro de cada fila."""
    ncol = len(objetivo_col)
    for _ in range(20000):
        cols = [sum(f[j] for f in matriz) for j in range(ncol)]
        dif = [cols[j] - objetivo_col[j] for j in range(ncol)]
        if all(d == 0 for d in dif):
            return matriz
        sobra = max(range(ncol), key=lambda j: dif[j])
        falta = min(range(ncol), key=lambda j: dif[j])
        for fila in sorted(matriz, key=lambda f: -f[sobra]):
            if fila[sobra] > 0:
                fila[sobra] -= 1
                fila[falta] += 1
                break
        else:
            break
    return matriz


def elige(opciones, pesos):
    r = random.random() * sum(pesos)
    acc = 0.0
    for o, p in zip(opciones, pesos):
        acc += p
        if r <= acc:
            return o
    return opciones[-1]


def leer_json(nombre):
    with open(os.path.join(DATA, nombre), encoding="utf-8") as f:
        return json.load(f)


# ---------------- generacion del tablero ----------------
def generar_filas():
    """Usa los totales REALES por departamento (mismos del mapa) y reparte
    por año, causa, vehículo, zona, mes y franja horaria."""
    agg = leer_json("agg_departamento.json")
    agg.sort(key=lambda d: -d["siniestros"])

    claves = [d["dep"] for d in agg]                     # AMAZONAS, ANCASH, ...
    nombres = [DEPARTAMENTOS[k][0] for k in claves]      # Amazonas, Áncash, ...
    sin_dep = [d["siniestros"] for d in agg]
    fal_dep = [d["fallecidos"] for d in agg]

    pesos_anio = [SERIE_ANUAL[a] for a in ANIOS]
    mat_sin = [reparto(sin_dep[i], pesos_anio) for i in range(len(claves))]
    ajustar_columnas(mat_sin, pesos_anio)
    mat_fal = [reparto(fal_dep[i], [max(s, 1) for s in mat_sin[i]]) for i in range(len(claves))]

    filas = []
    for idep in range(len(claves)):
        for ia in range(len(ANIOS)):
            tot_s, tot_f = mat_sin[idep][ia], mat_fal[idep][ia]
            if tot_s <= 0:
                continue
            # reparto jerarquico: causa -> vehiculo -> zona (conserva proporciones)
            bloques = []
            for ic, sc in enumerate(reparto(tot_s, PESO_CAU)):
                if sc <= 0:
                    continue
                jv = [p * (0.92 + random.random() * 0.16) for p in PESO_VEH]
                for iv, sv in enumerate(reparto(sc, jv)):
                    if sv <= 0:
                        continue
                    jz = [p * (0.9 + random.random() * 0.2) for p in PESO_ZONA]
                    for iz, sz in enumerate(reparto(sv, jz)):
                        if sz > 0:
                            bloques.append((iv, ic, iz, sz))

            rep_f = reparto(tot_f, [b[3] for b in bloques]) if bloques else []
            for k, b in enumerate(bloques):
                mes = elige(list(range(1, 13)), PESO_MES)
                hora = elige(list(range(len(HORAS))), PESO_HORA)
                filas.append([ia, idep, b[0], b[1], b[2], mes, hora, b[3], rep_f[k]])

    deps = [{"nombre": nombres[i], "clave": claves[i],
             "poblacion": DEPARTAMENTOS[claves[i]][1],
             "lat": agg[i]["lat"], "lng": agg[i]["lng"]} for i in range(len(claves))]
    return deps, filas, sum(sin_dep), sum(fal_dep)


def escribir_data_js():
    deps, filas, tot_s, tot_f = generar_filas()
    data = {
        "anios": ANIOS,
        "departamentos": deps,
        "vehiculos": VEHICULOS,
        "causas": CAUSAS,
        "zonas": ZONAS,
        "horas": HORAS,
        "poblacionNacional": sum(d["poblacion"] for d in deps),
        "totalSiniestros": tot_s,
        "totalFallecidos": tot_f,
        "packed": filas,
    }
    js = (
        "/* Datos del tablero SINIEX PERU - generados por build.py (no editar a mano) */\n"
        "(function(){\n"
        "var D = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "var A=D.anios, N=D.departamentos.map(function(d){return d.nombre;}),\n"
        "    V=D.vehiculos, C=D.causas, Z=D.zonas, H=D.horas;\n"
        "D.rows = D.packed.map(function(p){\n"
        "  return {anio:A[p[0]], dep:N[p[1]], veh:V[p[2]], cau:C[p[3]], zona:Z[p[4]],\n"
        "          mes:p[5], hora:H[p[6]], sin:p[7], fal:p[8]};\n"
        "});\n"
        "delete D.packed;\n"
        "window.SINIEX_DATA = D;\n"
        "})();\n"
    )
    ruta = os.path.join(BASE, "js", "data.js")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(js)

    ts = sum(r[7] for r in filas)
    tf = sum(r[8] for r in filas)
    print("Tablero  : %d filas | %d siniestros | %d fallecidos" % (len(filas), ts, tf))
    print("data.js  : %.1f KB" % (os.path.getsize(ruta) / 1024.0))
    assert ts == tot_s and tf == tot_f


# ---------------- datos del mapa envueltos en JS ----------------
def envolver_datos_mapa():
    """Convierte los .json/.geojson del mapa en .js asignados a window.MAPA_DATA
    para que el sitio abra con doble clic (file:// bloquea fetch)."""
    piezas = [
        ("geoDep",  "peru_departamentos.geojson", "geo_departamentos.js"),
        ("geoProv", "peru_provincias.geojson",    "geo_provincias.js"),
        ("aggDep",  "agg_departamento.json",      "agg_departamento.js"),
        ("aggProv", "agg_provincia.json",         "agg_provincia.js"),
        ("aggDist", "agg_distrito.json",          "agg_distrito.js"),
        ("puntos",  "siniestros_puntos.json",     "puntos.js"),
    ]
    total = 0
    for clave, origen, destino in piezas:
        obj = leer_json(origen)
        txt = ("window.MAPA_DATA=window.MAPA_DATA||{};window.MAPA_DATA.%s=%s;\n"
               % (clave, json.dumps(obj, ensure_ascii=False, separators=(",", ":"))))
        ruta = os.path.join(DATA, destino)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(txt)
        total += os.path.getsize(ruta)
    print("Mapa     : %d archivos JS | %.1f MB" % (len(piezas), total / 1048576.0))


# ---------------- empaquetado ----------------
def empaquetar():
    incluir_archivos = [
        "index.html", "README.txt", "servidor.py", "build.py",
        "css/styles.css", "css/mapa.css",
        "js/app.js", "js/data.js", "js/mapa.js", "js/api.js",
        "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/leaflet-heat.js",
        "api/app.py", "api/requirements.txt", "api/.env.example",
        "api/sql/consultas.sql", "api/LEEME.txt",
    ]
    incluir_dirs = ["vendor/leaflet/images", "data"]

    destino = os.path.join(BASE, "siniex-peru.zip")
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in incluir_archivos:
            ruta = os.path.join(BASE, rel)
            if os.path.exists(ruta):
                z.write(ruta, os.path.join("siniex-peru", rel))
        for d in incluir_dirs:
            raiz = os.path.join(BASE, d)
            for carpeta, _, archivos in os.walk(raiz):
                for a in archivos:
                    ruta = os.path.join(carpeta, a)
                    rel = os.path.relpath(ruta, BASE)
                    z.write(ruta, os.path.join("siniex-peru", rel))
    print("ZIP      : %s (%.1f MB)" % (destino, os.path.getsize(destino) / 1048576.0))


if __name__ == "__main__":
    escribir_data_js()
    envolver_datos_mapa()
    empaquetar()
