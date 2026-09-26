SINIEX PERÚ — Plataforma Nacional de Análisis de Siniestralidad Vial
====================================================================

CÓMO ABRIR
----------
Opción A (rápida):  doble clic en index.html.
                    Funciona todo, incluido el mapa. Sin internet, sin servidor.

Opción B (recomendada si vas a conectar PostgreSQL):
                    python servidor.py     ->  http://localhost:8000


ESTRUCTURA
----------
index.html            6 vistas del tablero
css/styles.css        estilos generales (tema oscuro, responsive, impresión)
css/mapa.css          estilos del mapa y de la vista de conexión
js/data.js            datos del tablero (generados por build.py)
js/app.js             KPIs, ranking, gráficos SVG, tablas, CSV, filtros
js/mapa.js            mapa interactivo (Leaflet)
js/api.js             conexión con el backend de PostgreSQL
data/                 geometrías y datos del mapa (.geojson/.json y su versión .js)
vendor/               Leaflet y leaflet.heat (locales, sin CDN)
api/                  backend Flask -> PostgreSQL
servidor.py           servidor local del sitio
build.py              regenera js/data.js, data/*.js y el ZIP:  python build.py


MAPA
----
Departamentos y provincias reales del Perú + 9,106 siniestros georreferenciados.
- Choropleth por intensidad de siniestros (se recolorea con los filtros activos).
- Burbujas proporcionales por departamento.
- Mapa de calor con los puntos reales.
- Al hacer zoom: departamentos -> provincias -> siniestros individuales.
- Clic en un departamento = filtra TODO el tablero (KPIs, ranking, gráficos, tablas).
- Botón "casa" o "Limpiar" para volver a todo el Perú.
- En el Explorador geográfico puedes apagar el mapa de calor y las etiquetas.

Contenedores: #mapSlot (Visión general) y #mapSlotGeo (Explorador geográfico).


CONECTAR TU BASE DE DATOS POSTGRESQL
------------------------------------
1. cd api
2. copia .env.example a .env y pon host, base, usuario y password
3. pip install -r requirements.txt
4. python app.py                      -> API en http://localhost:5000
5. abre la web con  python servidor.py  (http://localhost:8000)
6. pestaña "Conexión de datos":
      Probar conexión            -> valida credenciales y muestra conteos
      Cargar datos de PostgreSQL -> el tablero pasa a usar tus datos reales
      Volver a datos locales     -> regresa al dataset incluido

Endpoints: /api/health  /api/filtros  /api/rows  /api/mapa  /api/puntos
Consultas SQL completas en api/sql/consultas.sql (ajústalas si tu esquema difiere).

Nota: abriendo index.html con doble clic el navegador puede bloquear la llamada
al backend (política file://). Por eso para conectar la BD usa servidor.py.


QUÉ FUNCIONA EN EL TABLERO
--------------------------
- Filtros de año, región, tipo de vehículo y causa: recalculan todo.
- KPIs con sparklines y departamento con mayor siniestralidad.
- Ranking de regiones (clic = filtra por región).
- Evolución anual (siniestros / fallecidos).
- Causas con barras + dona clicables.
- Explorador geográfico: mapa + tabla ordenable con buscador.
- Análisis: vehículo, zona, mes, franja horaria y cruce causa × año.
- Reportes: tabla paginada, ordenable, descarga CSV e impresión/PDF.


DATOS INCLUIDOS
---------------
9,106 siniestros fatales y 10,859 fallecidos (2021–2025), por departamento,
provincia y distrito. Fuente declarada: ONSV / INEI.
La tasa por 100 mil habitantes usa proyecciones de población INEI; puedes
cambiarlas en build.py (diccionario DEPARTAMENTOS) o en api/app.py (POBLACION).
