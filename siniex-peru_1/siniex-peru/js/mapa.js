/* ============ SINIEX PERÚ · mapa interactivo (Leaflet) ============
   Se monta sobre los contenedores #mapSlot (Visión general) y #mapSlotGeo
   (Explorador geográfico). Se colorea con los datos FILTRADOS del tablero,
   así que responde a los filtros de año, vehículo y causa.
   Expone: SiniexMapa.crear(contenedor, opciones) y .refrescar(datosPorDepartamento)
=================================================================== */
window.SiniexMapa = (function () {
  "use strict";

  var ARCHIVOS = [
    "data/geo_departamentos.js",
    "data/geo_provincias.js",
    "data/agg_departamento.js",
    "data/agg_provincia.js",
    "data/agg_distrito.js",
    "data/puntos.js"
  ];

  var STOPS = [
    { t: 0.00, c: [30, 58, 138] },
    { t: 0.35, c: [124, 58, 237] },
    { t: 0.65, c: [234, 88, 12] },
    { t: 1.00, c: [220, 38, 38] }
  ];

  var instancias = [];
  var cargando = null;

  /* la capa de calor falla si el contenedor aún no tiene tamaño: la protegemos */
  if (window.L && L.HeatLayer && L.HeatLayer.prototype._redraw) {
    var _redrawOriginal = L.HeatLayer.prototype._redraw;
    L.HeatLayer.prototype._redraw = function () {
      if (!this._heat || !this._heat._width || !this._heat._height || !this._map) {
        this._frame = null;
        return;
      }
      return _redrawOriginal.apply(this, arguments);
    };
  }

  /* ---------- utilidades ---------- */
  function normalizar(s) {
    return (s || "").toString().toUpperCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ").trim();
  }
  function fmt(n) { return Math.round(n || 0).toLocaleString("es-PE"); }

  function color(valor, max) {
    var t = Math.max(0, Math.min(valor / (max || 1), 1));
    var a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (var i = 0; i < STOPS.length - 1; i++) {
      if (t >= STOPS[i].t && t <= STOPS[i + 1].t) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    }
    var span = (b.t - a.t) || 1, local = (t - a.t) / span;
    var rgb = a.c.map(function (v, i) { return Math.round(v + (b.c[i] - v) * local); });
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }

  /* ---------- carga de datos (funciona con file:// y con servidor) ---------- */
  function cargarScript(src) {
    return new Promise(function (ok, err) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = function () { err(new Error("No se pudo cargar " + src)); };
      document.head.appendChild(s);
    });
  }

  function cargarDatos() {
    if (window.MAPA_DATA && window.MAPA_DATA.puntos) return Promise.resolve(window.MAPA_DATA);
    if (cargando) return cargando;
    cargando = ARCHIVOS.reduce(function (p, src) {
      return p.then(function () { return cargarScript(src); });
    }, Promise.resolve()).then(function () { return window.MAPA_DATA; });
    return cargando;
  }

  /* espera a que el contenedor tenga tamaño (la vista puede estar oculta) */
  function esperarVisible(host) {
    return new Promise(function (ok) {
      var intentos = 0;
      (function mirar() {
        if (host.offsetWidth > 40 && host.offsetHeight > 40) return ok();
        if (++intentos > 600) return ok();          // ~60 s, se monta igual
        setTimeout(mirar, 100);
      })();
    });
  }

  /* ---------- creación de una instancia ---------- */
  function crear(idContenedor, opciones) {
    opciones = opciones || {};
    var host = document.getElementById(idContenedor);
    if (!host || host.dataset.listo) return null;
    host.dataset.listo = "1";
    host.innerHTML = '<div class="map-loading"><span class="spin"></span>Cargando mapa del Perú…</div>';

    var inst = {
      id: idContenedor, host: host, opciones: opciones,
      mapa: null, capaDep: null, capaProv: null, capaPuntos: null,
      capaCalor: null, etiquetas: null, datos: null, valores: {}, nivel: "dep"
    };
    instancias.push(inst);

    cargarDatos().then(function (D) {
      inst.datos = D;
      return esperarVisible(host).then(function () {
        host.innerHTML = "";
        montar(inst);
        if (opciones.alCrear) opciones.alCrear(inst);
      });
    }).catch(function (e) {
      host.innerHTML = '<div class="map-error"><b>No se pudo cargar el mapa.</b><br>' +
        'Revisa que la carpeta <code>data/</code> esté junto a index.html.<br>' +
        '<small>' + e.message + '</small></div>';
    });
    return inst;
  }

  function montar(inst) {
    var D = inst.datos, o = inst.opciones;

    var mapa = L.map(inst.host, {
      minZoom: 4, maxZoom: 16, zoomControl: false, attributionControl: false,
      preferCanvas: true, scrollWheelZoom: o.scroll !== false,
      zoomSnap: 0.25, zoomDelta: 0.5
    }).setView([-9.19, -75.02], o.zoom || 5);
    inst.mapa = mapa;
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    mapa.setMaxBounds(L.latLngBounds([-19.5, -82], [-0.01, -68]).pad(0.35));

    /* --- choropleth departamental --- */
    inst.capaDep = L.geoJSON(D.geoDep, {
      style: function (f) { return estiloDep(inst, f); },
      onEachFeature: function (f, layer) {
        var clave = normalizar(f.properties.NOMBDEP || f.properties.dep);
        layer.claveDep = clave;
        layer.on({
          mouseover: function (e) { e.target.setStyle({ weight: 2.4, opacity: 1, fillOpacity: 0.62 }); e.target.bringToFront(); },
          mouseout: function (e) { inst.capaDep.resetStyle(e.target); },
          click: function () { if (o.alSeleccionar) o.alSeleccionar(clave); }
        });
      }
    }).addTo(mapa);

    /* --- choropleth provincial (se activa con zoom) --- */
    if (D.geoProv) {
      inst.capaProv = L.geoJSON(D.geoProv, {
        style: { color: "#5b6bd9", weight: 0.7, opacity: 0.35, fillColor: "#101d34", fillOpacity: 0.05 },
        onEachFeature: function (f, layer) {
          var info = buscarProv(D, f.properties.dep, f.properties.prov);
          layer.bindTooltip("<b>" + f.properties.prov + "</b><br>" +
            (info ? fmt(info.siniestros) + " siniestros · " + fmt(info.fallecidos) + " fallecidos" : "sin registros"),
            { sticky: true, className: "tt-siniex" });
        }
      });
    }

    /* --- capa de calor --- */
    inst.capaCalor = L.heatLayer(D.puntos.map(function (p) { return [p.lat, p.lng, Math.max(p.fallecidos, 1)]; }), {
      radius: 18, blur: 24, maxZoom: 13, minOpacity: 0.25,
      gradient: { 0.2: "#2563eb", 0.4: "#7c3aed", 0.65: "#ea580c", 1.0: "#dc2626" }
    });
    if (o.calor !== false) inst.capaCalor.addTo(mapa);

    /* --- burbujas por departamento --- */
    inst.capaBurbujas = L.layerGroup().addTo(mapa);

    /* --- puntos individuales (zoom alto) --- */
    var renderer = L.canvas({ padding: 0.5 });
    inst.capaPuntos = L.layerGroup();
    D.puntos.forEach(function (p) {
      var m = L.circleMarker([p.lat, p.lng], {
        renderer: renderer, radius: 3 + Math.min(p.fallecidos, 5) * 0.9,
        fillColor: p.fallecidos > 1 ? "#dc2626" : "#ef4444", fillOpacity: 0.85,
        color: "#fca5a5", weight: 0.6, opacity: 0.9
      });
      m.claveDep = normalizar(p.dep);
      m.bindTooltip("<b>" + p.dist + "</b>, " + p.prov + "<br>" +
        p.fallecidos + " fallecido(s) · " + p.lesionados + " lesionado(s)", { sticky: true, className: "tt-siniex" });
      inst.capaPuntos.addLayer(m);
    });

    /* --- etiquetas por nivel (departamento / provincia / distrito) --- */
    function capaEtiquetas(lista, clase) {
      var capa = L.layerGroup();
      lista.forEach(function (d) {
        if (d.lat == null || d.lng == null) return;
        L.marker([d.lat, d.lng], {
          icon: L.divIcon({ className: clase, html: "<span>" + (d.dist || d.prov || d.dep) + "</span>", iconSize: [0, 0] }),
          interactive: false
        }).addTo(capa);
      });
      return capa;
    }
    inst.etiquetasPorNivel = {
      dep: capaEtiquetas(D.aggDep, "label-dep"),
      prov: capaEtiquetas(D.aggProv, "label-prov"),
      dist: capaEtiquetas(D.aggDist, "label-dist")
    };
    inst.etiquetas = inst.etiquetasPorNivel.dep;     // la visible en cada momento
    if (o.etiquetas !== false) inst.etiquetas.addTo(mapa);

    /* --- encuadre inicial al contenedor --- */
    try {
      inst.boundsPeru = inst.capaDep.getBounds();
      mapa.fitBounds(inst.boundsPeru, { padding: [8, 8] });
      mapa.setMinZoom(Math.max(3, mapa.getZoom() - 1));
    } catch (e) { }

    /* --- cambio de nivel por zoom --- */
    mapa.on("zoomend", function () { actualizarNivel(inst); });
    actualizarNivel(inst);

    if (inst.pendiente) {
      var p = inst.pendiente; inst.pendiente = null;
      aplicar(inst, p.valores, p.detalle, p.seleccion);
    }
  }

  function buscarProv(D, dep, prov) {
    var nd = normalizar(dep), np = normalizar(prov);
    for (var i = 0; i < D.aggProv.length; i++) {
      if (normalizar(D.aggProv[i].dep) === nd && normalizar(D.aggProv[i].prov) === np) return D.aggProv[i];
    }
    return null;
  }

  function actualizarNivel(inst) {
    var base = inst.zoomBase || (inst.zoomBase = inst.mapa.getZoom());
    var z = inst.mapa.getZoom(), nuevo;
    if (z <= base + 1) nuevo = "dep";
    else if (z <= base + 4) nuevo = "prov";
    else nuevo = "dist";
    if (nuevo === inst.nivel) return;
    inst.nivel = nuevo;

    if (inst.capaProv) {
      if (nuevo === "dep") inst.mapa.removeLayer(inst.capaProv);
      else if (!inst.mapa.hasLayer(inst.capaProv)) inst.capaProv.addTo(inst.mapa);
    }
    // etiquetas del nivel activo
    if (inst.etiquetasPorNivel) {
      var mostrarEtiquetas = inst.mapa.hasLayer(inst.etiquetas);
      if (mostrarEtiquetas) inst.mapa.removeLayer(inst.etiquetas);
      inst.etiquetas = inst.etiquetasPorNivel[nuevo] || inst.etiquetasPorNivel.dep;
      if (mostrarEtiquetas) inst.etiquetas.addTo(inst.mapa);
    }

    if (nuevo === "dist") {
      if (!inst.mapa.hasLayer(inst.capaPuntos)) inst.capaPuntos.addTo(inst.mapa);
      if (inst.mapa.hasLayer(inst.capaCalor)) inst.mapa.removeLayer(inst.capaCalor);
    } else {
      if (inst.mapa.hasLayer(inst.capaPuntos)) inst.mapa.removeLayer(inst.capaPuntos);
      if (inst.opciones.calor !== false && !inst.mapa.hasLayer(inst.capaCalor)) inst.capaCalor.addTo(inst.mapa);
    }
    if (inst.opciones.alCambiarNivel) {
      inst.opciones.alCambiarNivel({ dep: "Departamentos", prov: "Provincias", dist: "Distritos · siniestros individuales" }[nuevo]);
    }
  }

  function estiloDep(inst, f) {
    var clave = normalizar(f.properties.NOMBDEP || f.properties.dep);
    var v = inst.valores[clave] || 0;
    var max = inst.maxValor || 1;
    var t = max ? v / max : 0;
    var sel = inst.seleccion;
    var apagado = sel && sel !== clave;
    return {
      fillColor: v ? color(v, max) : "#16233d",
      // el departamento seleccionado se aclara para que se vean sus puntos
      fillOpacity: apagado ? 0.08 : (sel === clave ? 0.2 : 0.22 + t * 0.45),
      color: sel === clave ? "#ffd23f" : "#5b6bd9",
      weight: sel === clave ? 2.6 : 1.1,
      opacity: apagado ? 0.25 : 0.6
    };
  }

  /* ---------- API pública ---------- */
  function refrescarTodos(valoresPorClave, detallePorClave, seleccion) {
    instancias.forEach(function (inst) {
      aplicar(inst, valoresPorClave, detallePorClave, seleccion);
    });
  }

  function aplicar(inst, valoresPorClave, detallePorClave, seleccion) {
    (function () {
      inst.valores = valoresPorClave;
      inst.detalle = detallePorClave;
      inst.seleccion = seleccion || null;
      inst.maxValor = Object.keys(valoresPorClave).reduce(function (m, k) {
        return Math.max(m, valoresPorClave[k]);
      }, 0) || 1;

      // si el mapa no existe o su vista está oculta, se aplica al volver
      if (!inst.mapa || inst.host.offsetWidth < 40 || inst.host.offsetHeight < 40) {
        inst.pendiente = { valores: valoresPorClave, detalle: detallePorClave, seleccion: seleccion };
        return;
      }
      inst.capaDep.eachLayer(function (layer) { layer.setStyle(estiloDep(inst, layer.feature)); });
      inst.capaDep.eachLayer(function (layer) {
        var k = layer.claveDep, d = (detallePorClave || {})[k];
        var nombre = (d && d.nombre) || k;
        layer.unbindTooltip();
        layer.bindTooltip("<b>" + nombre + "</b><br>" +
          fmt(inst.valores[k] || 0) + " siniestros fatales" +
          (d ? "<br>" + fmt(d.fallecidos) + " fallecidos" : ""), { sticky: true, className: "tt-siniex" });
      });

      // burbujas proporcionales
      inst.capaBurbujas.clearLayers();
      (inst.datos.aggDep || []).forEach(function (d) {
        var k = normalizar(d.dep), v = inst.valores[k] || 0;
        if (!v) return;
        var t = v / inst.maxValor;
        var m = L.circleMarker([d.lat, d.lng], {
          radius: 4 + Math.sqrt(t) * 15,
          fillColor: color(v, inst.maxValor), fillOpacity: 0.85,
          color: "rgba(255,255,255,.75)", weight: 1,
          className: t > 0.65 ? "marker-pulse" : ""
        });
        var det = (detallePorClave || {})[k];
        m.bindTooltip("<b>" + ((det && det.nombre) || d.dep) + "</b><br>" + fmt(v) + " siniestros" +
          (det ? " · " + fmt(det.fallecidos) + " fallecidos" : ""), { sticky: true, className: "tt-siniex" });
        m.on("click", function () { if (inst.opciones.alSeleccionar) inst.opciones.alSeleccionar(k); });
        inst.capaBurbujas.addLayer(m);
      });

      // puntos individuales visibles solo del departamento seleccionado
      inst.capaPuntos.eachLayer(function (m) {
        var vis = !seleccion || m.claveDep === seleccion;
        m.setStyle({ opacity: vis ? 0.9 : 0, fillOpacity: vis ? 0.85 : 0 });
      });
    })();
  }

  function enfocar(clave) {
    instancias.forEach(function (inst) {
      if (!inst.mapa) return;
      if (inst.host.offsetWidth < 40 || inst.host.offsetHeight < 40) { inst.enfoque = clave || null; return; }
      inst.enfoque = clave || null;
      enfocarInstancia(inst, clave);
    });
  }

  function enfocarInstancia(inst, clave) {
    if (!inst.mapa || inst.host.offsetWidth < 40) return;
    if (!clave) {
      if (inst.boundsPeru) inst.mapa.flyToBounds(inst.boundsPeru, { padding: [8, 8], duration: 0.7 });
      else inst.mapa.flyTo([-9.19, -75.02], 5, { duration: 0.7 });
      return;
    }
    var objetivo = null;
    inst.capaDep.eachLayer(function (l) { if (l.claveDep === clave) objetivo = l; });
    if (objetivo) {
      try { inst.mapa.flyToBounds(objetivo.getBounds().pad(0.15), { duration: 0.8 }); } catch (e) { }
    }
  }

  function capa(nombre, visible) {
    instancias.forEach(function (inst) {
      if (!inst.mapa) return;
      var c = nombre === "calor" ? inst.capaCalor : nombre === "etiquetas" ? inst.etiquetas : null;
      if (!c) return;
      if (nombre === "calor") inst.opciones.calor = visible;
      if (visible && !inst.mapa.hasLayer(c)) c.addTo(inst.mapa);
      if (!visible && inst.mapa.hasLayer(c)) inst.mapa.removeLayer(c);
    });
  }

  function invalidar() {
    instancias.forEach(function (inst) {
      if (inst.mapa) setTimeout(function () {
        if (inst.host.offsetWidth < 40) return;
        inst.mapa.invalidateSize();
        if (inst.pendiente) {
          var p = inst.pendiente; inst.pendiente = null;
          aplicar(inst, p.valores, p.detalle, p.seleccion);
        }
        if (inst.enfoque) {                       // hay un departamento elegido
          if (inst.enfoqueAplicado !== inst.enfoque) {
            inst.enfoqueAplicado = inst.enfoque;
            enfocarInstancia(inst, inst.enfoque);
          }
          return;
        }
        inst.enfoqueAplicado = null;
        if (inst.boundsPeru) {                    // sin selección: reencuadrar el país
          inst.mapa.fitBounds(inst.boundsPeru, { padding: [8, 8], animate: false });
          inst.zoomBase = inst.mapa.getZoom();
          return;
        }
        if (inst.boundsPeru && !inst.seleccion && inst.mapa.getZoom() <= (inst.zoomBase || 5) + 1) {
          inst.mapa.fitBounds(inst.boundsPeru, { padding: [8, 8], animate: false });
          inst.zoomBase = inst.mapa.getZoom();
        }
      }, 220);
    });
  }

  return {
    crear: crear,
    refrescar: refrescarTodos,
    enfocar: enfocar,
    capa: capa,
    invalidar: invalidar,
    normalizar: normalizar,
    color: color
  };
})();
