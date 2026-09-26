/* ============ SINIEX PERÚ · conexión a PostgreSQL ============
   Front-end de la vista "Conexión de datos".
   Habla con el backend de api/app.py (Flask + psycopg2):
     GET /api/health   -> estado de la conexión
     GET /api/filtros  -> años, departamentos, vehículos y causas de la BD
     GET /api/rows     -> filas agregadas que alimentan TODO el tablero
     GET /api/mapa     -> agregados por departamento para el mapa
     GET /api/puntos   -> coordenadas de siniestros para el mapa
============================================================== */
window.SiniexAPI = (function () {
  "use strict";

  var LS = "siniex.api";
  var cfg = { baseUrl: "http://localhost:5000", auto: false };

  try {
    var guardado = JSON.parse(localStorage.getItem(LS) || "null");
    if (guardado) cfg = Object.assign(cfg, guardado);
  } catch (e) { /* localStorage no disponible */ }

  function guardar() {
    try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { }
  }

  function url(ruta) {
    return cfg.baseUrl.replace(/\/+$/, "") + ruta;
  }

  function pedir(ruta, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 15000);
    return fetch(url(ruta), { signal: ctrl ? ctrl.signal : undefined, cache: "no-store" })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status + " en " + ruta);
        return r.json();
      });
  }

  /* ---------- UI ---------- */
  var $ = function (s) { return document.querySelector(s); };
  var logBox;

  function log(txt, tipo) {
    if (!logBox) return;
    var linea = document.createElement("div");
    linea.className = "log-line " + (tipo || "");
    linea.textContent = "[" + new Date().toLocaleTimeString("es-PE") + "] " + txt;
    logBox.insertBefore(linea, logBox.firstChild);
  }

  function estado(texto, clase) {
    var e = $("#apiEstado");
    if (!e) return;
    e.textContent = texto;
    e.className = "conn-state " + (clase || "");
  }

  function probar() {
    estado("Probando conexión…", "wait");
    log("GET " + url("/api/health"));
    return pedir("/api/health", 10000).then(function (d) {
      if (!d.ok) throw new Error(d.error || "El servidor respondió sin conexión a la base");
      estado("Conectado · " + d.base + " @ " + d.host, "ok");
      log("PostgreSQL " + (d.version || "") + " · " + d.siniestros + " siniestros en la tabla", "ok");
      var info = $("#apiInfo");
      if (info) {
        info.innerHTML =
          '<div class="cover-item"><b>' + (d.base || "—") + "</b><span>base de datos</span></div>" +
          '<div class="cover-item"><b>' + (d.host || "—") + "</b><span>host</span></div>" +
          '<div class="cover-item"><b>' + Number(d.siniestros || 0).toLocaleString("es-PE") + "</b><span>siniestros</span></div>" +
          '<div class="cover-item"><b>' + Number(d.personas || 0).toLocaleString("es-PE") + "</b><span>personas</span></div>" +
          '<div class="cover-item"><b>' + Number(d.vehiculos || 0).toLocaleString("es-PE") + "</b><span>vehículos</span></div>" +
          '<div class="cover-item"><b>' + (d.version || "—") + "</b><span>versión</span></div>";
      }
      return d;
    }).catch(function (e) {
      estado("Sin conexión", "err");
      log("Error: " + e.message + " — ¿está corriendo api/app.py?", "err");
      throw e;
    });
  }

  function cargarTablero() {
    estado("Cargando datos…", "wait");
    log("GET " + url("/api/rows"));
    return pedir("/api/rows", 60000).then(function (d) {
      if (!d.rows || !d.rows.length) throw new Error("La consulta no devolvió filas");
      window.SiniexApp.aplicarDatos(d);
      estado("Tablero con datos de PostgreSQL (" + d.rows.length + " filas)", "ok");
      log("Tablero actualizado: " + d.rows.length + " filas agregadas", "ok");
      var b = $("#btnVolverDemo");
      if (b) b.disabled = false;
      return d;
    }).catch(function (e) {
      estado("Error al cargar", "err");
      log("Error: " + e.message, "err");
      throw e;
    });
  }

  function volverDemo() {
    window.SiniexApp.restaurarDatos();
    estado("Usando datos locales (data.js)", "");
    log("Se restauraron los datos locales del archivo js/data.js");
  }

  function init() {
    logBox = $("#apiLog");
    var input = $("#apiUrl");
    if (input) {
      input.value = cfg.baseUrl;
      input.addEventListener("change", function () {
        cfg.baseUrl = this.value.trim() || "http://localhost:5000";
        this.value = cfg.baseUrl;
        guardar();
        log("URL del backend: " + cfg.baseUrl);
      });
    }
    var auto = $("#apiAuto");
    if (auto) {
      auto.checked = !!cfg.auto;
      auto.addEventListener("change", function () {
        cfg.auto = this.checked; guardar();
        log(cfg.auto ? "Se conectará automáticamente al abrir la web" : "Conexión automática desactivada");
      });
    }
    var bp = $("#btnProbar"); if (bp) bp.addEventListener("click", function () { probar().catch(function () { }); });
    var bc = $("#btnCargar"); if (bc) bc.addEventListener("click", function () { cargarTablero().catch(function () { }); });
    var bv = $("#btnVolverDemo"); if (bv) { bv.disabled = true; bv.addEventListener("click", volverDemo); }

    $$copiar("#btnCopiarEnv", "#bloqueEnv");
    $$copiar("#btnCopiarSql", "#bloqueSql");

    estado("Usando datos locales (data.js)", "");

    if (cfg.auto) {
      log("Conexión automática activada…");
      probar().then(cargarTablero).catch(function () { });
    }
  }

  function $$copiar(boton, bloque) {
    var b = $(boton), t = $(bloque);
    if (!b || !t) return;
    b.addEventListener("click", function () {
      var texto = t.textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(texto);
      else {
        var ta = document.createElement("textarea");
        ta.value = texto; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) { }
        document.body.removeChild(ta);
      }
      var txt = b.textContent; b.textContent = "¡Copiado!";
      setTimeout(function () { b.textContent = txt; }, 1200);
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  return { probar: probar, cargarTablero: cargarTablero, volverDemo: volverDemo, cfg: cfg };
})();
