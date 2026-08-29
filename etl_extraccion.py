import pandas as pd

# ---- Extracción de los 4 datasets ----

df_siniestros = pd.read_excel(
    'BBDD_ONSV_-_SINIESTROS_FATALES_2021-2025_FORMULAS.xlsx',
    sheet_name='SINIESTROS', header=4
)
df_vehiculos = pd.read_excel(
    'BBDD_ONSV_-_VEHICULOS_2021-2025_FORMULAS.xlsx',
    sheet_name='VEHICULO INVOLUCRADOS', header=4
)
df_personas = pd.read_excel(
    'BBDD_ONSV_-_PERSONAS_2021-2025_FORMULAS.xlsx',
    sheet_name='PERSONAS INVOLUCRADAS', header=4
)

df_poblacion = pd.read_csv('TB_POBLACION_INEI.csv', sep=';')

# ---- Verificación ----
print("SINIESTROS:", df_siniestros.shape)
print(df_siniestros.head())

print("\nVEHICULOS:", df_vehiculos.shape)
print(df_vehiculos.head())

print("\nPERSONAS:", df_personas.shape)
print(df_personas.head())

print("\nPOBLACION:", df_poblacion.shape)
print(df_poblacion.head())


# ======================================================
# ---- 3.1.2 TRANSFORMACIÓN ----
# ======================================================

# Limpieza de nombres de columna (quita espacios sobrantes)
for df in [df_siniestros, df_vehiculos, df_personas]:
    df.columns = df.columns.str.strip()

# Conversión de fecha a tipo datetime
df_siniestros['FECHA SINIESTRO'] = pd.to_datetime(df_siniestros['FECHA SINIESTRO'], errors='coerce')

# Homogenización de nombre de columna clave
# En Personas la columna original es "CÓDIGO VEHÍCULO" (con tilde en ambas palabras)
# En Vehiculos la columna original es "CÓDIGO VEHICULO" (con tilde solo en CÓDIGO)
# Ambas quedan homogenizadas como "CODIGO VEHICULO" (sin tildes)
df_personas = df_personas.rename(columns={'CÓDIGO VEHÍCULO': 'CODIGO VEHICULO'})
df_vehiculos = df_vehiculos.rename(columns={'CÓDIGO VEHICULO': 'CODIGO VEHICULO'})

# Agregación del dataset de Población: suma por Departamento/Provincia/Distrito
df_poblacion_agg = df_poblacion.groupby(
    ['Departamento', 'Provincia', 'Distrito'], as_index=False
)['Cantidad'].sum()

# ---- Verificación de la transformación ----
print("\n--- TRANSFORMACIÓN ---")
print("Fechas convertidas, ejemplo:", df_siniestros['FECHA SINIESTRO'].iloc[0])
print("\nPoblación agregada por distrito:", df_poblacion_agg.shape)
print(df_poblacion_agg.head())
print("\nTotal habitantes:", df_poblacion_agg['Cantidad'].sum())


# ======================================================
# ---- 3.1.3 CARGA ----
# ======================================================

from sqlalchemy import create_engine
import urllib

# --- Conexión a SQL Server ---
params = urllib.parse.quote_plus(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=LUDWING\\SQLEXPRESS;"
    "DATABASE=SiniestralidadVialPeru;"
    "Trusted_Connection=yes;"
)
engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}")

# --- Corrección puntual de nombres antes de construir Ubicacion ---
correcciones = {'NASCA': 'NAZCA'}
df_siniestros['DISTRITO'] = df_siniestros['DISTRITO'].replace(correcciones)

# --- 1. Construir tabla Ubicacion (dimensión única) ---
ubic_siniestros = df_siniestros[['DEPARTAMENTO', 'PROVINCIA', 'DISTRITO']]
ubic_poblacion = df_poblacion_agg[['Departamento', 'Provincia', 'Distrito']].rename(
    columns={'Departamento': 'DEPARTAMENTO', 'Provincia': 'PROVINCIA', 'Distrito': 'DISTRITO'}
)
df_ubicacion = pd.concat([ubic_siniestros, ubic_poblacion]).drop_duplicates().reset_index(drop=True)

df_ubicacion.to_sql('Ubicacion', engine, if_exists='append', index=False)
print(f"Ubicacion cargada: {len(df_ubicacion)} filas")

# --- 2. Recuperar los ID_UBICACION generados por SQL Server ---
df_ubic_bd = pd.read_sql("SELECT ID_UBICACION, DEPARTAMENTO, PROVINCIA, DISTRITO FROM Ubicacion", engine)

# --- 3. Enlazar ID_UBICACION a Siniestros ---
# YA CARGADA en la base de datos (9106 filas) -- NO volver a ejecutar el to_sql
df_siniestros = df_siniestros.merge(
    df_ubic_bd, on=['DEPARTAMENTO', 'PROVINCIA', 'DISTRITO'], how='left'
)
print("Siniestros sin ID_UBICACION asignado:", df_siniestros['ID_UBICACION'].isna().sum())

df_siniestros_final = df_siniestros[['CÓDIGO SINIESTRO', 'ID_UBICACION', 'FECHA SINIESTRO', 'HORA SINIESTRO',
               'CLASE SINIESTRO', 'CANTIDAD DE FALLECIDOS', 'CANTIDAD DE LESIONADOS',
               'CONDICIÓN CLIMÁTICA', 'CARACTERÍSTICAS DE VÍA',
               'CAUSA FACTOR PRINCIPAL']].rename(columns={
    'CÓDIGO SINIESTRO': 'CODIGO_SINIESTRO',
    'FECHA SINIESTRO': 'FECHA_SINIESTRO',
    'HORA SINIESTRO': 'HORA_SINIESTRO',
    'CLASE SINIESTRO': 'CLASE_SINIESTRO',
    'CANTIDAD DE FALLECIDOS': 'CANTIDAD_FALLECIDOS',
    'CANTIDAD DE LESIONADOS': 'CANTIDAD_LESIONADOS',
    'CONDICIÓN CLIMÁTICA': 'CONDICION_CLIMATICA',
    'CARACTERÍSTICAS DE VÍA': 'CARACTERISTICAS_VIA',
    'CAUSA FACTOR PRINCIPAL': 'CAUSA_FACTOR_PRINCIPAL'
})
df_siniestros_final.to_sql('Siniestros', engine, if_exists='append', index=False)
print("Siniestros cargados")

# --- 4. Vehiculos ---
df_vehiculos[['CODIGO VEHICULO', 'CÓDIGO SINIESTRO', 'VEHÍCULO',
              'MODALIDAD DE TRANSPORTE', 'ESTADO SOAT']].rename(columns={
    'CODIGO VEHICULO': 'CODIGO_VEHICULO',
    'CÓDIGO SINIESTRO': 'CODIGO_SINIESTRO',
    'VEHÍCULO': 'TIPO_VEHICULO',
    'MODALIDAD DE TRANSPORTE': 'MODALIDAD_TRANSPORTE',
    'ESTADO SOAT': 'ESTADO_SOAT'
}).to_sql('Vehiculos', engine, if_exists='append', index=False)
print("Vehiculos cargados")

# --- 5. Personas ---
# Limpieza: eliminar código de persona duplicado (1 caso: P-2023-04-103-1-2,
# mismo código de persona asignado a 2 vehículos distintos por error de registro)
df_personas = df_personas.drop_duplicates(subset='CÓDIGO PERSONA', keep='first')

# Limpieza: convertir valores no numéricos de EDAD ("NO INDICA") a nulo
df_personas['EDAD'] = pd.to_numeric(df_personas['EDAD'], errors='coerce')

df_personas[['CÓDIGO PERSONA', 'CODIGO VEHICULO', 'TIPO PERSONA',
             'GRAVEDAD', 'EDAD', 'SEXO']].rename(columns={
    'CÓDIGO PERSONA': 'CODIGO_PERSONA',
    'CODIGO VEHICULO': 'CODIGO_VEHICULO',
    'TIPO PERSONA': 'TIPO_PERSONA'
}).to_sql('Personas', engine, if_exists='append', index=False)
print("Personas cargadas")

# --- 6. Poblacion ---
df_poblacion_agg = df_poblacion_agg.rename(
    columns={'Departamento': 'DEPARTAMENTO', 'Provincia': 'PROVINCIA', 'Distrito': 'DISTRITO'}
).merge(df_ubic_bd, on=['DEPARTAMENTO', 'PROVINCIA', 'DISTRITO'], how='left')

df_poblacion_agg[['ID_UBICACION', 'Cantidad']].rename(
    columns={'Cantidad': 'POBLACION_TOTAL'}
).to_sql('Poblacion', engine, if_exists='append', index=False)
print("Poblacion cargada")

print("\n--- CARGA COMPLETA ---")