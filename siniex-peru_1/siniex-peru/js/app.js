/* ============ SINIEX PERÚ · lógica ============ */
(function () {
  "use strict";

  var D = window.SINIEX_DATA;
  var ROWS_LOCALES = D.rows.slice();  // copia original (datos de js/data.js)
  var ROWS = D.rows;                 // {anio, dep, veh, cau, zona, mes, hora, sin, fal}
  var DEPS = D.departamentos;        // [{nombre, clave, poblacion, lat, lng}]
  var VEHS = D.vehiculos;
  var CAUS = D.causas;
  var ZONAS = D.zonas;
  var MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Set","Oct","Nov","Dic"];
  var HORAS = ["00-03","03-06","06-09","09-12","12-15","15-18","18-21","21-24"];

  var PAL = ["#ff3b5c","#ff8a3d","#ffd23f","#22d3ee","#8fa3c4","#a855f7","#3b82f6","#2dd4bf"];

  var state = {
    year: "all", region: "all", vehicle: "all", cause: "all",
    evoMetric: "siniestros", causeMetric: "pct",
    rankAll: false, geoSort: { k: "siniestros", dir: -1 }, geoQuery: "",
    repSort: { k: "siniestros", dir: -1 }, page: 1, perPage: 50
  };

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function fmt(n) { return Math.round(n).toLocaleString("es-PE"); }
  function fmt1(n) { return (Math.round(n * 10) / 10).toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function el(tag, attrs, html) {
    var e = document.createElementNS(tag === "svg" || SVG_TAGS[tag] ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml", tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  var SVG_TAGS = { g:1,path:1,rect:1,circle:1,text:1,line:1,polyline:1,polygon:1,defs:1,linearGradient:1,stop:1,tspan:1 };

  /* ---------- filtro ---------- */
  function filtered(extra) {
    extra = extra || {};
    var y = extra.year !== undefined ? extra.year : state.year;
    var r = extra.region !== undefined ? extra.region : state.region;
    var v = extra.vehicle !== undefined ? extra.vehicle : state.vehicle;
    var c = extra.cause !== undefined ? extra.cause : state.cause;
    var out = [];
    for (var i = 0; i < ROWS.length; i++) {
      var x = ROWS[i];
      if (y !== "all" && x.anio !== +y) continue;
      if (r !== "all" && x.dep !== r) continue;
      if (v !== "all" && x.veh !== v) continue;
      if (c !== "all" && x.cau !== c) continue;
      out.push(x);
    }
    return out;
  }
  function sum(rows, key) { var t = 0; for (var i = 0; i < rows.length; i++) t += rows[i][key]; return t; }
  function groupBy(rows, key) {
    var m = {};
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i][key];
      if (!m[k]) m[k] = { key: k, sin: 0, fal: 0 };
      m[k].sin += rows[i].sin; m[k].fal += rows[i].fal;
    }
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function poblacion(region) {
    if (region === "all") return D.poblacionNacional;
    for (var i = 0; i < DEPS.length; i++) if (DEPS[i].nombre === region) return DEPS[i].poblacion;
    return D.poblacionNacional;
  }
  function norm(s) {
    return (s || "").toString().toUpperCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }
  function nombrePorClave(clave) {
    for (var i = 0; i < DEPS.length; i++) {
      if (norm(DEPS[i].clave || DEPS[i].nombre) === clave) return DEPS[i].nombre;
    }
    return clave;
  }

  /* ---------- SVG charts ---------- */
  function lineChart(host, labels, values, color) {
    host.innerHTML = "";
    var W = 700, H = 230, PL = 42, PR = 16, PT = 26, PB = 28;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none" });
    var max = Math.max.apply(null, values.concat([1]));
    var nice = niceMax(max);
    var iw = W - PL - PR, ih = H - PT - PB;
    var x = function (i) { return PL + (labels.length === 1 ? iw / 2 : iw * i / (labels.length - 1)); };
    var y = function (v) { return PT + ih - (v / nice) * ih; };

    for (var t = 0; t <= 3; t++) {
      var vy = PT + ih * t / 3;
      svg.appendChild(el("line", { x1: PL, y1: vy, x2: W - PR, y2: vy, class: "grid-line" }));
      var lbl = nice * (3 - t) / 3;
      svg.appendChild(text(PL - 8, vy + 4, lbl >= 1000 ? (Math.round(lbl / 100) / 10) + "K" : fmt(lbl), "axis-txt", "end"));
    }
    var d = "", area = "";
    for (var i = 0; i < values.length; i++) {
      d += (i ? " L" : "M") + x(i) + " " + y(values[i]);
    }
    area = d + " L" + x(values.length - 1) + " " + (PT + ih) + " L" + x(0) + " " + (PT + ih) + " Z";
    var defs = el("defs");
    defs.innerHTML = '<linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".45"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient>';
    svg.appendChild(defs);
    svg.appendChild(el("path", { d: area, fill: "url(#lg)", stroke: "none" }));
    svg.appendChild(el("path", { d: d, stroke: color, "stroke-width": 2.4, fill: "none" }));
    for (i = 0; i < values.length; i++) {
      svg.appendChild(el("circle", { cx: x(i), cy: y(values[i]), r: 4, fill: "#0a1428", stroke: color, "stroke-width": 2.4 }));
      svg.appendChild(text(x(i), y(values[i]) - 12, fmt(values[i]), "val-txt", "middle"));
      svg.appendChild(text(x(i), H - 8, labels[i], "axis-txt", "middle"));
    }
    host.appendChild(svg);
  }

  function barChart(host, labels, values, color) {
    host.innerHTML = "";
    var W = 700, H = 230, PL = 42, PR = 12, PT = 22, PB = 28;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none" });
    var nice = niceMax(Math.max.apply(null, values.concat([1])));
    var iw = W - PL - PR, ih = H - PT - PB;
    var bw = iw / labels.length;
    for (var t = 0; t <= 3; t++) {
      var vy = PT + ih * t / 3;
      svg.appendChild(el("line", { x1: PL, y1: vy, x2: W - PR, y2: vy, class: "grid-line" }));
      var lbl = nice * (3 - t) / 3;
      svg.appendChild(text(PL - 8, vy + 4, lbl >= 1000 ? (Math.round(lbl / 100) / 10) + "K" : fmt(lbl), "axis-txt", "end"));
    }
    for (var i = 0; i < labels.length; i++) {
      var h = (values[i] / nice) * ih;
      svg.appendChild(el("rect", {
        x: PL + bw * i + bw * 0.2, y: PT + ih - h, width: bw * 0.6, height: Math.max(h, 1),
        rx: 3, fill: color, stroke: "none", opacity: .9
      }));
      svg.appendChild(text(PL + bw * i + bw / 2, H - 8, labels[i], "axis-txt", "middle"));
    }
    host.appendChild(svg);
  }

  function donut(host, parts, centerTop, centerBottom) {
    host.innerHTML = "";
    var svg = el("svg", { viewBox: "0 0 160 160" });
    var total = parts.reduce(function (a, b) { return a + b.value; }, 0) || 1;
    var cx = 80, cy = 80, r = 60, sw = 18, acc = -Math.PI / 2;
    parts.forEach(function (p) {
      var ang = (p.value / total) * Math.PI * 2;
      if (ang <= 0) return;
      var large = ang > Math.PI ? 1 : 0;
      var x1 = cx + r * Math.cos(acc), y1 = cy + r * Math.sin(acc);
      var x2 = cx + r * Math.cos(acc + ang), y2 = cy + r * Math.sin(acc + ang);
      svg.appendChild(el("path", {
        d: "M" + x1 + " " + y1 + " A" + r + " " + r + " 0 " + large + " 1 " + x2 + " " + y2,
        stroke: p.color, "stroke-width": sw, fill: "none", "stroke-linecap": "butt"
      }));
      acc += ang;
    });
    svg.appendChild(text(cx, cy - 6, centerTop, "donut-c", "middle", 13));
    svg.appendChild(text(cx, cy + 14, centerBottom, "axis-txt", "middle", 10));
    host.appendChild(svg);
  }

  function sparkline(host, values, color) {
    host.innerHTML = "";
    var W = 300, H = 70;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none" });
    var max = Math.max.apply(null, values.concat([1])), min = Math.min.apply(null, values);
    var rng = (max - min) || 1;
    var d = "";
    for (var i = 0; i < values.length; i++) {
      var x = W * i / Math.max(values.length - 1, 1);
      var y = H - 8 - ((values[i] - min) / rng) * (H - 26);
      d += (i ? " L" : "M") + x + " " + y;
    }
    var defs = el("defs");
    var id = "sp" + Math.random().toString(36).slice(2, 7);
    defs.innerHTML = '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient>';
    svg.appendChild(defs);
    svg.appendChild(el("path", { d: d + " L" + W + " " + H + " L0 " + H + " Z", fill: "url(#" + id + ")", stroke: "none" }));
    svg.appendChild(el("path", { d: d, stroke: color, "stroke-width": 2, fill: "none" }));
    host.appendChild(svg);
  }

  function text(x, y, str, cls, anchor, size) {
    var t = el("text", { x: x, y: y, class: cls, "text-anchor": anchor || "start" });
    if (size) t.setAttribute("font-size", size);
    t.textContent = str;
    return t;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = Math.ceil(v / p * 4) / 4 * p;
    return n;
  }
  function colorScale(i, n) { return PAL[i % PAL.length]; }
  function heatColor(t) { // 0..1
    var stops = [[30, 58, 138], [67, 56, 202], [168, 85, 247], [255, 59, 92], [255, 210, 63]];
    var p = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
    var i = Math.floor(p), f = p - i;
    var a = stops[i], b = stops[i + 1];
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," + Math.round(a[2] + (b[2] - a[2]) * f) + ")";
  }

  /* ================= RENDER ================= */
  function render() {
    var rows = filtered();
    renderKPIs(rows);
    renderRanking(rows);
    renderEvo();
    renderCauses(rows);
    renderGeo(rows);
    renderAnalysis(rows);
    renderReport(rows);
    renderCover();
    renderMapa(rows);
  }

  /* ---------- mapa ---------- */
  function renderMapa(rows) {
    if (!window.SiniexMapa) return;
    var g = groupBy(rows, "dep");
    var valores = {}, detalle = {};
    g.forEach(function (x) {
      var clave = norm(claveDe(x.key));
      valores[clave] = x.sin;
      detalle[clave] = { nombre: x.key, fallecidos: x.fal };
    });
    var sel = state.region === "all" ? null : norm(claveDe(state.region));
    SiniexMapa.refrescar(valores, detalle, sel);
    renderMapInfo(rows);
  }
  function claveDe(nombre) {
    for (var i = 0; i < DEPS.length; i++) if (DEPS[i].nombre === nombre) return DEPS[i].clave || nombre;
    return nombre;
  }
  function renderMapInfo(rows) {
    var n = $("#miName"); if (!n) return;
    var s = sum(rows, "sin"), f = sum(rows, "fal");
    n.textContent = state.region === "all" ? "Perú" : state.region;
    $("#miLevel").textContent = state.region === "all" ? "Nacional" : "Departamento";
    $("#miSin").textContent = fmt(s);
    $("#miFal").textContent = fmt(f);
    $("#miTasa").textContent = fmt1(f / poblacion(state.region) * 100000);
  }

  function seleccionarDesdeMapa(clave) {
    var nombre = nombrePorClave(clave);
    state.region = (state.region === nombre) ? "all" : nombre;
    var fr = $("#fRegion"); if (fr) fr.value = state.region;
    render();
    SiniexMapa.enfocar(state.region === "all" ? null : norm(claveDe(state.region)));
  }

  function iniciarMapa(idContenedor, opts) {
    if (!window.SiniexMapa || !window.L) return;
    SiniexMapa.crear(idContenedor, Object.assign({
      alSeleccionar: seleccionarDesdeMapa,
      alCrear: function () { renderMapa(filtered()); }
    }, opts || {}));
  }

  function renderKPIs(rows) {
    var s = sum(rows, "sin"), f = sum(rows, "fal");
    $("#kpiSiniestros").textContent = fmt(s);
    $("#kpiFallecidos").textContent = fmt(f);
    var pob = poblacion(state.region);
    $("#kpiTasa").textContent = fmt1(f / pob * 100000);

    var periodo = state.year === "all" ? "Total 2021–2025" : "Total " + state.year;
    $("#kpiSiniestrosFoot").textContent = periodo;
    $("#kpiFallecidosFoot").textContent = periodo;

    var g = groupBy(rows, "dep").sort(function (a, b) { return b.sin - a.sin; });
    $("#kpiTopRegion").textContent = g.length ? g[0].key.toUpperCase() : "—";
    $("#kpiTopValue").textContent = g.length ? fmt(g[0].sin) : "0";

    var serie = D.anios.map(function (y) { return sum(filtered({ year: y }), "sin"); });
    var serieF = D.anios.map(function (y) { return sum(filtered({ year: y }), "fal"); });
    var serieT = D.anios.map(function (y, i) { return serieF[i] / pob * 100000; });
    sparkline($("#sparkSiniestros"), serie, "#3b82f6");
    sparkline($("#sparkFallecidos"), serieF, "#a855f7");
    sparkline($("#sparkTasa"), serieT, "#2dd4bf");
    renderMiniMap(g);
  }

  function renderMiniMap(g) {
    var host = $("#kpiMiniMap");
    host.innerHTML = "";
    var svg = el("svg", { viewBox: "0 0 60 80" });
    var max = g.length ? g[0].sin : 1;
    var LAT0 = -0.04, LAT1 = -18.4, LNG0 = -81.4, LNG1 = -68.6;
    DEPS.forEach(function (d) {
      if (d.lat == null || d.lng == null) return;
      var dep = g.filter(function (x) { return x.key === d.nombre; })[0];
      var t = dep ? dep.sin / max : 0;
      var x = (d.lng - LNG0) / (LNG1 - LNG0) * 52 + 4;
      var y = (d.lat - LAT0) / (LAT1 - LAT0) * 72 + 4;
      svg.appendChild(el("circle", {
        cx: x.toFixed(1), cy: y.toFixed(1), r: (2.2 + Math.sqrt(t) * 4.5).toFixed(1),
        fill: heatColor(t), stroke: "none", opacity: (0.45 + t * 0.55).toFixed(2)
      }));
    });
    host.appendChild(svg);
  }

  function renderRanking(rows) {
    var g = groupBy(rows, "dep").sort(function (a, b) { return b.sin - a.sin; });
    var list = state.rankAll ? g : g.slice(0, 5);
    var max = g.length ? g[0].sin : 1;
    var ol = $("#rankList");
    ol.innerHTML = "";
    list.forEach(function (d, i) {
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="rank-pos">' + (i + 1) + '</span>' +
        '<span><span class="rank-name">' + d.key + '</span>' +
        '<span class="rank-bar"><i style="width:' + (d.sin / max * 100) + '%;background:' + heatColor(0.74 + 0.26 * (i / Math.max(list.length - 1, 1))) + '"></i></span></span>' +
        '<span class="rank-val">' + fmt(d.sin) + '</span>';
      li.addEventListener("click", function () {
        state.region = (state.region === d.key) ? "all" : d.key;
        $("#fRegion").value = state.region;
        render();
      });
      ol.appendChild(li);
    });
    $("#btnRankAll").innerHTML = (state.rankAll ? "Ver solo el top 5" : "Ver ranking completo") + ' <span>›</span>';
    $("#rankRange").textContent = "(" + (state.year === "all" ? "2021–2025" : state.year) + ")";
  }

  function renderEvo() {
    var metric = state.evoMetric === "fallecidos" ? "fal" : "sin";
    var labels = D.anios.map(String);
    var values = D.anios.map(function (y) { return sum(filtered({ year: y }), metric); });
    lineChart($("#chartEvo"), labels, values, metric === "sin" ? "#3b82f6" : "#a855f7");
  }

  function renderCauses(rows) {
    var g = groupBy(rows, "cau");
    var map = {};
    g.forEach(function (x) { map[x.key] = x.sin; });
    var total = sum(rows, "sin") || 1;
    var data = CAUS.map(function (c, i) { return { name: c, value: map[c] || 0, color: PAL[i % PAL.length] }; })
      .sort(function (a, b) { return b.value - a.value; });

    var host = $("#causeBars");
    host.innerHTML = "";
    var max = data.length ? data[0].value : 1;
    data.forEach(function (c) {
      var div = document.createElement("div");
      div.className = "cbar" + (state.cause === c.name ? " sel" : "");
      var val = state.causeMetric === "pct" ? (Math.round(c.value / total * 1000) / 10) + "%" : fmt(c.value);
      div.innerHTML = '<span class="cname">' + c.name + '</span>' +
        '<span class="ctrack"><i style="width:' + (max ? c.value / max * 100 : 0) + '%;background:' + c.color + '"></i></span>' +
        '<span class="cval" style="color:' + c.color + '">' + val + '</span>';
      div.addEventListener("click", function () {
        state.cause = state.cause === c.name ? "all" : c.name;
        $("#fCause").value = state.cause;
        render();
      });
      host.appendChild(div);
    });
    donut($("#causeDonut"), data, fmt(total), "siniestros");
  }

  function renderGeo(rows) {
    var g = groupBy(rows, "dep");
    var total = sum(rows, "sin") || 1;
    var data = g.map(function (x) {
      return {
        nombre: x.key, siniestros: x.sin, fallecidos: x.fal,
        tasa: x.fal / poblacion(x.key) * 100000,
        part: x.sin / total * 100
      };
    });
    var q = state.geoQuery.toLowerCase();
    if (q) data = data.filter(function (d) { return d.nombre.toLowerCase().indexOf(q) >= 0; });
    var k = state.geoSort.k, dir = state.geoSort.dir;
    data.sort(function (a, b) {
      if (typeof a[k] === "string") return a[k].localeCompare(b[k]) * dir * -1;
      return (a[k] - b[k]) * dir;
    });
    var max = data.reduce(function (m, d) { return Math.max(m, d.siniestros); }, 1);
    var tb = $("#geoTable tbody");
    tb.innerHTML = "";
    data.forEach(function (d) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + d.nombre + "</td>" +
        '<td class="num">' + fmt(d.siniestros) + "</td>" +
        '<td class="num">' + fmt(d.fallecidos) + "</td>" +
        '<td class="num">' + fmt1(d.tasa) + "</td>" +
        '<td class="num"><div class="mini-track"><i style="width:' + (d.siniestros / max * 100) + '%"></i></div></td>';
      tr.addEventListener("click", function () {
        state.region = state.region === d.nombre ? "all" : d.nombre;
        $("#fRegion").value = state.region;
        render();
      });
      tb.appendChild(tr);
    });
  }

  function renderAnalysis(rows) {
    // vehículos
    var gv = groupBy(rows, "veh").sort(function (a, b) { return b.sin - a.sin; });
    var maxv = gv.length ? gv[0].sin : 1;
    var totalv = sum(rows, "sin") || 1;
    var hv = $("#vehBars"); hv.innerHTML = "";
    gv.forEach(function (v, i) {
      var div = document.createElement("div");
      div.className = "cbar";
      div.innerHTML = '<span class="cname">' + v.key + '</span>' +
        '<span class="ctrack"><i style="width:' + (v.sin / maxv * 100) + '%;background:' + PAL[i % PAL.length] + '"></i></span>' +
        '<span class="cval" style="color:' + PAL[i % PAL.length] + '">' + fmt(v.sin) + '</span>';
      div.addEventListener("click", function () {
        state.vehicle = state.vehicle === v.key ? "all" : v.key;
        $("#fVehicle").value = state.vehicle;
        render();
      });
      hv.appendChild(div);
    });

    // zonas
    var gz = groupBy(rows, "zona").sort(function (a, b) { return b.sin - a.sin; });
    var maxz = gz.length ? gz[0].sin : 1;
    var hz = $("#zonaBars"); hz.innerHTML = "";
    gz.forEach(function (z, i) {
      var div = document.createElement("div");
      div.className = "cbar";
      var pct = Math.round(z.sin / totalv * 1000) / 10;
      div.innerHTML = '<span class="cname">' + z.key + '</span>' +
        '<span class="ctrack"><i style="width:' + (z.sin / maxz * 100) + '%;background:' + PAL[(i + 3) % PAL.length] + '"></i></span>' +
        '<span class="cval" style="color:' + PAL[(i + 3) % PAL.length] + '">' + pct + '%</span>';
      hz.appendChild(div);
    });
    donut($("#zonaDonut"), gz.map(function (z, i) { return { value: z.sin, color: PAL[(i + 3) % PAL.length] }; }), fmt(totalv), "siniestros");

    // mes / hora
    var gm = groupBy(rows, "mes");
    var mv = MESES.map(function (m, i) {
      var f = gm.filter(function (x) { return +x.key === i + 1; })[0];
      return f ? f.sin : 0;
    });
    barChart($("#chartMes"), MESES, mv, "#22d3ee");

    var gh = groupBy(rows, "hora");
    var hvv = HORAS.map(function (h) {
      var f = gh.filter(function (x) { return x.key === h; })[0];
      return f ? f.sin : 0;
    });
    barChart($("#chartHora"), HORAS, hvv, "#ff8a3d");

    // cruce causa x año
    var thead = $("#crossTable thead"), tbody = $("#crossTable tbody");
    thead.innerHTML = "<tr><th>Causa principal</th>" + D.anios.map(function (y) { return '<th class="num">' + y + "</th>"; }).join("") + '<th class="num">Total</th></tr>';
    tbody.innerHTML = "";
    CAUS.forEach(function (c) {
      var cells = "", tot = 0;
      D.anios.forEach(function (y) {
        var v = sum(filtered({ year: y, cause: c }), "sin");
        tot += v;
        cells += '<td class="num">' + fmt(v) + "</td>";
      });
      tbody.innerHTML += "<tr><td>" + c + "</td>" + cells + '<td class="num"><b>' + fmt(tot) + "</b></td></tr>";
    });
  }

  /* ---------- reportes ---------- */
  function reportRows() {
    var rows = filtered().slice();
    var agg = {};
    rows.forEach(function (r) {
      var k = r.anio + "|" + r.dep + "|" + r.veh + "|" + r.cau + "|" + r.zona;
      if (!agg[k]) agg[k] = { anio: r.anio, departamento: r.dep, vehiculo: r.veh, causa: r.cau, zona: r.zona, siniestros: 0, fallecidos: 0 };
      agg[k].siniestros += r.sin; agg[k].fallecidos += r.fal;
    });
    var out = Object.keys(agg).map(function (k) { return agg[k]; });
    var k = state.repSort.k, dir = state.repSort.dir;
    out.sort(function (a, b) {
      if (typeof a[k] === "string") return a[k].localeCompare(b[k]) * dir * -1;
      return (a[k] - b[k]) * dir;
    });
    return out;
  }

  function renderReport() {
    var data = reportRows();
    var pages = Math.max(1, Math.ceil(data.length / state.perPage));
    if (state.page > pages) state.page = pages;
    var slice = data.slice((state.page - 1) * state.perPage, state.page * state.perPage);
    var tb = $("#reportTable tbody");
    tb.innerHTML = slice.map(function (r) {
      return "<tr><td>" + r.anio + "</td><td>" + r.departamento + "</td><td>" + r.vehiculo + "</td><td>" +
        r.causa + "</td><td>" + r.zona + '</td><td class="num">' + fmt(r.siniestros) + '</td><td class="num">' + fmt(r.fallecidos) + "</td></tr>";
    }).join("");
    $("#reportCount").textContent = fmt(data.length) + " filas";
    $("#pagInfo").textContent = state.page + " / " + pages;
    $("#pagPrev").disabled = state.page <= 1;
    $("#pagNext").disabled = state.page >= pages;
  }

  function downloadCSV() {
    var data = reportRows();
    var head = ["anio", "departamento", "vehiculo", "causa", "zona", "siniestros", "fallecidos"];
    var lines = [head.join(";")];
    data.forEach(function (r) { lines.push(head.map(function (h) { return r[h]; }).join(";")); });
    var blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "siniex_reporte.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function renderCover() {
    var host = $("#coverRow");
    if (host.dataset.done) return;
    host.dataset.done = "1";
    var items = [
      ["25", "departamentos"], ["196", "provincias"], ["1 874", "distritos"],
      ["2021–2025", "periodo cubierto"], [fmt(D.totalSiniestros), "siniestros fatales"], [fmt(D.totalFallecidos), "fallecidos"]
    ];
    host.innerHTML = items.map(function (it) {
      return '<div class="cover-item"><b>' + it[0] + "</b><span>" + it[1] + "</span></div>";
    }).join("");
  }

  /* ---------- navegación ---------- */
  var TITLES = {
    overview: ["Visión general", "Análisis de siniestralidad vial fatal en el Perú, 2021–2025"],
    geo: ["Explorador geográfico", "Distribución territorial de siniestros fatales"],
    analysis: ["Análisis", "Patrones por vehículo, zona, mes y franja horaria"],
    reports: ["Reportes", "Exportación de datos agregados según filtros"],
    conexion: ["Conexión de datos", "Conecta el tablero a tu base de datos PostgreSQL"],
    about: ["Acerca del sistema", "Fuentes, modelo de datos y cobertura"]
  };
  function go(view) {
    $$(".nav-item").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
    $$(".view").forEach(function (s) { s.classList.toggle("active", s.id === "view-" + view); });
    $("#viewTitle").textContent = TITLES[view][0];
    $("#viewSub").textContent = TITLES[view][1];
    window.scrollTo(0, 0);
    if (view === "geo") {
      iniciarMapa("mapSlotGeo", {
        zoom: 5,
        alCambiarNivel: function (txt) { var c = $("#mapChipGeo"); if (c) c.textContent = txt; }
      });
    }
    if (window.SiniexMapa) SiniexMapa.invalidar();
  }

  /* ---------- side art ---------- */
  function sideArt() {
    var g = $("#sideDots");
    if (!g) return;
    var seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 150; i++) {
      var x = 20 + rnd() * 110, y = 10 + rnd() * 180;
      var c = el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: (rnd() * 1.3 + .4).toFixed(2), opacity: (.25 + rnd() * .7).toFixed(2) });
      g.appendChild(c);
    }
  }

  /* ---------- tooltips ---------- */
  function tooltips() {
    var tip = $("#tooltip");
    document.addEventListener("mouseover", function (e) {
      var t = e.target.closest ? e.target.closest("[data-tip]") : null;
      if (!t) return;
      tip.textContent = t.getAttribute("data-tip");
      var r = t.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - 260, r.left) + "px";
      tip.style.top = (r.bottom + 8) + "px";
      tip.classList.add("show");
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest && e.target.closest("[data-tip]")) tip.classList.remove("show");
    });
  }

  /* ---------- init ---------- */
  function init() {
    // selects
    var fr = $("#fRegion");
    DEPS.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre); }).forEach(function (d) {
      fr.appendChild(new Option(d.nombre, d.nombre));
    });
    var fv = $("#fVehicle");
    VEHS.forEach(function (v) { fv.appendChild(new Option(v, v)); });
    var fc = $("#fCause");
    CAUS.forEach(function (c) { fc.appendChild(new Option(c, c)); });

    fr.addEventListener("change", function () {
      state.region = this.value; render();
      if (window.SiniexMapa) SiniexMapa.enfocar(state.region === "all" ? null : norm(claveDe(state.region)));
    });
    fv.addEventListener("change", function () { state.vehicle = this.value; render(); });
    fc.addEventListener("change", function () { state.cause = this.value; render(); });
    $("#fYear").addEventListener("change", function () { state.year = this.value; render(); });

    $("#btnReset").addEventListener("click", function () {
      state.year = state.region = state.vehicle = state.cause = "all";
      $("#fYear").value = "all"; fr.value = "all"; fv.value = "all"; fc.value = "all";
      state.page = 1; render();
      if (window.SiniexMapa) SiniexMapa.enfocar(null);
    });

    $("#evoMetric").addEventListener("change", function () { state.evoMetric = this.value; renderEvo(); });
    $("#causeMetric").addEventListener("change", function () { state.causeMetric = this.value; renderCauses(filtered()); });
    $("#btnRankAll").addEventListener("click", function () { state.rankAll = !state.rankAll; renderRanking(filtered()); });

    $$("#nav .nav-item").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.view); }); });
    $$(".seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".seg-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
      });
    });

    $("#geoSearch").addEventListener("input", function () { state.geoQuery = this.value; renderGeo(filtered()); });
    $$("#geoTable th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.sort;
        state.geoSort = { k: k, dir: state.geoSort.k === k ? -state.geoSort.dir : -1 };
        renderGeo(filtered());
      });
    });
    $$("#reportTable th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.sort;
        state.repSort = { k: k, dir: state.repSort.k === k ? -state.repSort.dir : -1 };
        renderReport();
      });
    });
    $("#pagPrev").addEventListener("click", function () { if (state.page > 1) { state.page--; renderReport(); } });
    $("#pagNext").addEventListener("click", function () { state.page++; renderReport(); });
    $("#btnCsv").addEventListener("click", downloadCSV);
    $("#btnPrint").addEventListener("click", function () { window.print(); });

    // ---- mapa ----
    iniciarMapa("mapSlot", {
      zoom: 5, scroll: false, calor: false, etiquetas: false,
      alCambiarNivel: function (txt) { var c = $("#mapChip"); if (c) c.textContent = txt; }
    });
    var bh = $("#btnMapHome"), bhg = $("#btnMapHomeGeo");
    function volverPeru() {
      state.region = "all"; $("#fRegion").value = "all";
      render(); SiniexMapa.enfocar(null);
    }
    if (bh) bh.addEventListener("click", volverPeru);
    if (bhg) bhg.addEventListener("click", volverPeru);

    var sc = $("#swCalor"), se = $("#swEtiquetas");
    if (sc) sc.addEventListener("change", function () { SiniexMapa.capa("calor", this.checked); });
    if (se) se.addEventListener("change", function () { SiniexMapa.capa("etiquetas", this.checked); });

    sideArt();
    tooltips();
    render();
  }

  /* ---------- puente con la API de PostgreSQL ---------- */
  window.SiniexApp = {
    aplicarDatos: function (d) {
      if (d.departamentos && d.departamentos.length) {
        DEPS = D.departamentos = d.departamentos;
        D.poblacionNacional = d.poblacionNacional || D.poblacionNacional;
        var fr = $("#fRegion");
        fr.innerHTML = '<option value="all">Región: todas</option>';
        DEPS.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre); })
          .forEach(function (x) { fr.appendChild(new Option(x.nombre, x.nombre)); });
      }
      if (d.anios && d.anios.length) {
        D.anios = d.anios;
        var fy = $("#fYear");
        fy.innerHTML = '<option value="all">' + d.anios[0] + " – " + d.anios[d.anios.length - 1] + "</option>";
        d.anios.forEach(function (a) { fy.appendChild(new Option(a, a)); });
      }
      if (d.vehiculos && d.vehiculos.length) {
        VEHS = D.vehiculos = d.vehiculos;
        var fv = $("#fVehicle");
        fv.innerHTML = '<option value="all">Tipo de vehículo: todos</option>';
        VEHS.forEach(function (v) { fv.appendChild(new Option(v, v)); });
      }
      if (d.causas && d.causas.length) {
        CAUS = D.causas = d.causas;
        var fc = $("#fCause");
        fc.innerHTML = '<option value="all">Causa: todas</option>';
        CAUS.forEach(function (c) { fc.appendChild(new Option(c, c)); });
      }
      ROWS = D.rows = d.rows;
      state.year = state.region = state.vehicle = state.cause = "all";
      state.page = 1;
      var cr = $("#coverRow"); if (cr) delete cr.dataset.done;
      render();
    },
    restaurarDatos: function () {
      ROWS = D.rows = ROWS_LOCALES.slice();
      state.year = state.region = state.vehicle = state.cause = "all";
      $("#fYear").value = "all"; $("#fRegion").value = "all";
      $("#fVehicle").value = "all"; $("#fCause").value = "all";
      render();
    },
    render: render,
    estado: state
  };

  document.addEventListener("DOMContentLoaded", init);
})();
