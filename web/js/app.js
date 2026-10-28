import { Editor } from "./editor.js";
import { Console } from "./console.js";
import { Programs, Settings } from "./storage.js";
import { parseProfile, adaptExample } from "./profiles.js";

const $ = (s) => document.querySelector(s);
const PERFIL_POR_DEFECTO = "Flexible";

// ---------------------------------------------------------------- estado
let perfiles = [];
let perfilActual = null; // {nombre, desc, texto}
let cfg = parseProfile("");
let programa = null; // {id, nombre, codigo}

// ---------------------------------------------------------------- editor
const editor = new Editor($("#editor"), {
  onChange: (code) => {
    if (programa) {
      programa.codigo = code;
      guardarPronto();
    }
    revisarPronto();
  },
});
editor.onErrorTap = (line, msg) => toast(`Línea ${line}: ${msg}`);

let saveTimer = null;
function guardarPronto() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => Programs.update(programa.id, { codigo: programa.codigo }), 400);
}

function abrirPrograma(p) {
  programa = p;
  Programs.setCurrent(p.id);
  editor.value = p.codigo;
  $("#prog-name").textContent = p.nombre;
  revisarPronto(0);
}

function plantillaNueva() {
  const fin = cfg.force_semicolon ? ";" : "";
  const alg = cfg.prefer_algoritmo ? "Algoritmo" : "Proceso";
  return `${alg} sin_titulo\n\tEscribir "Hola mundo"${fin}\nFin${alg}\n`;
}

// ---------------------------------------------------------------- consola
const consola = new Console($("#console"), {
  onLineLink: (n) => { mostrar("code"); editor.goToLine(n); },
});

// ---------------------------------------------------------------- botón "atrás" de Android
// Cada diálogo abierto (y la vista de ejecución en el celular) agrega un paso al
// historial: así el botón o gesto "atrás" lo cierra en vez de salir de la app.
let ignorarPop = false;
let reemplazarProximo = false;

function abrir(dlg) {
  if (!dlg.open) dlg.showModal();
  if (reemplazarProximo) history.replaceState({ nav: dlg.id }, "");
  else if (history.state?.nav !== dlg.id) history.pushState({ nav: dlg.id }, "");
  reemplazarProximo = false;
}

for (const dlg of document.querySelectorAll("dialog")) {
  dlg.addEventListener("close", () => {
    if (dlg.viaAtras) { dlg.viaAtras = false; return; }
    if (reemplazarProximo) return; // se abre otro diálogo en su lugar
    if (history.state?.nav === dlg.id) { ignorarPop = true; history.back(); }
  });
}

addEventListener("popstate", () => {
  if (ignorarPop) { ignorarPop = false; return; }
  const abiertos = [...document.querySelectorAll("dialog[open]")];
  const arriba = abiertos[abiertos.length - 1];
  if (arriba) { arriba.viaAtras = true; arriba.close(); }
  else if (panes.dataset.view === "run") mostrar("code", true);
});

// ---------------------------------------------------------------- vistas (celular)
const panes = $(".panes");
function mostrar(vista, desdeAtras = false) {
  if (vista === "run" && !pantallaAncha() && panes.dataset.view !== "run") history.pushState({ nav: "run" }, "");
  if (vista === "code" && !desdeAtras && history.state?.nav === "run") { ignorarPop = true; history.back(); }
  panes.dataset.view = vista;
  $("#tab-code").setAttribute("aria-selected", vista === "code");
  $("#tab-run").setAttribute("aria-selected", vista === "run");
  if (vista === "run") $("#tab-run .dot").hidden = true;
}
$("#tab-code").onclick = () => mostrar("code");
$("#tab-run").onclick = () => mostrar("run");
const pantallaAncha = () => matchMedia("(min-width: 900px)").matches;

// ---------------------------------------------------------------- ejecución
let runWorker = null;
let runId = 0;
let corriendo = false;

function nuevoWorker() {
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}

function setCorriendo(si) {
  corriendo = si;
  const btn = $("#btn-run");
  btn.classList.toggle("running", si);
  btn.querySelector("use").setAttribute("href", si ? "#i-stop" : "#i-play");
  btn.querySelector("span").textContent = si ? "Detener" : "Ejecutar";
  $("#btn-rerun").hidden = si;
}

function ejecutar() {
  if (corriendo) return detener();
  if (!runWorker) runWorker = nuevoWorker();
  const id = ++runId;
  consola.clear();
  $("#run-state").textContent = "Ejecutando…";
  setCorriendo(true);
  mostrar("run");
  document.activeElement?.blur?.();

  runWorker.onmessage = async (ev) => {
    const m = ev.data;
    if (m.id !== id) return;
    if (m.type === "output") consola.write(m.text);
    else if (m.type === "input-request") {
      $("#run-state").textContent = m.kind === "key" ? "Esperando una tecla…" : "Esperando que ingreses un valor…";
      if (!pantallaAncha() && panes.dataset.view !== "run") $("#tab-run .dot").hidden = false;
      const text = m.kind === "key" ? await consola.askKey() : await consola.askLine();
      if (id !== runId) return;
      $("#run-state").textContent = "Ejecutando…";
      runWorker.postMessage({ type: "input", text });
    } else if (m.type === "exit") {
      consola.finish();
      setCorriendo(false);
      $("#run-state").textContent = "Ejecución finalizada";
    } else if (m.type === "crash") {
      consola.finish();
      consola.note("Error interno del intérprete: " + m.message, "note");
      setCorriendo(false);
      $("#run-state").textContent = "La ejecución se interrumpió";
      runWorker.terminate();
      runWorker = null;
    }
  };
  runWorker.postMessage({ type: "run", id, source: editor.value, profile: perfilActual?.texto });
}

function detener() {
  if (!corriendo) return;
  runWorker?.terminate();
  runWorker = null;
  runId++;
  consola.cancelInput();
  consola.finish();
  consola.note("Ejecución detenida.");
  setCorriendo(false);
  $("#run-state").textContent = "Detenida";
}

$("#btn-run").onclick = ejecutar;
$("#btn-rerun").onclick = ejecutar;

// ---------------------------------------------------------------- revisión de sintaxis mientras se escribe
let checkWorker = null;
let checkId = 0;
let checkTimer = null;
let ultimosErrores = [];

function revisarPronto(delay = 700) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(revisar, delay);
}

function revisar() {
  if (!checkWorker) {
    checkWorker = nuevoWorker();
    checkWorker.onmessage = (ev) => {
      const m = ev.data;
      if (m.id !== checkId || m.type !== "check-result") return;
      const errores = [];
      for (const linea of m.text.split("\n")) {
        const r = linea.match(/^Lin (\d+) \(inst \d+\): ERROR (\d+): (.*)$/);
        if (r) errores.push({ line: +r[1], code: +r[2], msg: r[3] });
      }
      ultimosErrores = errores;
      editor.setErrors(errores);
      mostrarEstado(errores);
    };
  }
  const id = ++checkId;
  // Un programa que tarda demasiado en revisarse no deberia trabar la siguiente revision
  const w = checkWorker;
  const guard = setTimeout(() => {
    if (id === checkId && w === checkWorker) { w.terminate(); checkWorker = null; }
  }, 4000);
  w.addEventListener("message", () => clearTimeout(guard), { once: true });
  w.postMessage({ type: "check", id, source: editor.value, profile: perfilActual?.texto });
}

function mostrarEstado(errores) {
  const el = $("#syntax-status");
  el.hidden = false;
  if (!errores.length) {
    el.className = "syntax-status ok";
    el.innerHTML = `<svg><use href="#i-ok"/></svg><span class="sr">Sin errores</span>`;
    el.setAttribute("aria-label", "Sin errores de sintaxis");
  } else {
    el.className = "syntax-status";
    el.innerHTML = `<svg><use href="#i-err"/></svg>${errores.length}`;
    el.setAttribute("aria-label", `${errores.length} errores de sintaxis`);
  }
}
$("#syntax-status").onclick = () => {
  if (!ultimosErrores.length) return toast("No hay errores de sintaxis");
  abrirLista({
    titulo: `Errores (${ultimosErrores.length})`,
    items: ultimosErrores.map((e) => ({
      titulo: `Línea ${e.line}`,
      detalle: e.msg,
      accion: () => { cerrarLista(); mostrar("code"); editor.goToLine(e.line); },
    })),
  });
};

// ---------------------------------------------------------------- teclas extra
const keybar = $("#keybar");
// pointerdown + preventDefault: el editor no pierde el foco y el teclado no se cierra
keybar.addEventListener("pointerdown", (e) => { if (e.target.closest(".kb")) e.preventDefault(); });
keybar.addEventListener("click", (e) => {
  const b = e.target.closest(".kb");
  if (!b) return;
  if (b.dataset.action === "undo") return editor.undo();
  if (b.dataset.action === "redo") return editor.redo();
  if (b.dataset.action === "tab") return editor.insert("\t");
  if (b.dataset.tpl !== undefined) return editor.insertTemplate(plantillas()[+b.dataset.tpl].tpl);
  const ins = b.dataset.ins;
  if (ins) {
    editor.insert(ins);
    const back = +(b.dataset.back || 0);
    if (back) {
      const ta = editor.ta;
      ta.setSelectionRange(ta.selectionStart - back, ta.selectionStart - back);
    }
  }
});

function plantillas() {
  const pc = cfg.force_semicolon ? ";" : "";
  const alg = cfg.prefer_algoritmo ? "Algoritmo" : "Proceso";
  const fun = cfg.prefer_funcion ? "Funcion" : cfg.prefer_algoritmo ? "SubAlgoritmo" : "SubProceso";
  return [
    { label: "Escribir", tpl: `Escribir ▮${pc}` },
    { label: "Leer", tpl: `Leer ▮${pc}` },
    { label: "Definir", tpl: `Definir ▮ Como Entero${pc}` },
    { label: "Si", tpl: `Si ▮ Entonces\n\t\nFinSi` },
    { label: "Si-SiNo", tpl: `Si ▮ Entonces\n\t\nSiNo\n\t\nFinSi` },
    { label: "Mientras", tpl: `Mientras ▮ Hacer\n\t\nFinMientras` },
    { label: "Para", tpl: `Para i <- 1 Hasta ▮ Con Paso 1 Hacer\n\t\nFinPara` },
    { label: "Repetir", tpl: `Repetir\n\t▮\nHasta Que ` },
    { label: "Según", tpl: `Segun ▮ Hacer\n\t1:\n\t\t\n\t2:\n\t\t\n\tDe Otro Modo:\n\t\t\nFinSegun` },
    { label: "Dimension", tpl: `Dimension ▮[10]${pc}` },
    { label: alg, tpl: `${alg} ▮\n\t\nFin${alg}` },
    // Con el perfil "Estilo Java" la función devuelve su valor con Retornar
    cfg.allow_return
      ? { label: fun, tpl: `${fun} ▮(param)\n\tRetornar \nFin${fun}` }
      : { label: fun, tpl: `${fun} resultado <- ▮(param)\n\t\nFin${fun}` },
    ...(cfg.allow_return ? [{ label: "Retornar", tpl: `Retornar ▮${pc}` }] : []),
    { label: "Esperar", tpl: `Esperar ▮ Segundos${pc}` },
    { label: "Limpiar", tpl: `Limpiar Pantalla${pc}▮` },
    { label: "Verdadero", tpl: "Verdadero" },
    { label: "Falso", tpl: "Falso" },
    { label: cfg.word_operators ? "Y" : "&", tpl: cfg.word_operators ? " Y " : " & " },
    { label: cfg.word_operators ? "O" : "|", tpl: cfg.word_operators ? " O " : " | " },
    { label: cfg.word_operators ? "NO" : "~", tpl: cfg.word_operators ? "NO " : "~" },
    { label: "MOD", tpl: " MOD " },
  ];
}

function dibujarPlantillas() {
  $("#row-templates").innerHTML = plantillas()
    .map((p, i) => `<button class="kb" data-tpl="${i}">${p.label}</button>`)
    .join("");
}

// ---------------------------------------------------------------- perfiles
function aplicarPerfil(p) {
  perfilActual = p;
  cfg = parseProfile(p?.texto || "");
  Settings.set("perfil", p?.nombre || "");
  $("#menu-profile").textContent = "Perfil: " + (p?.nombre || "por defecto");
  dibujarPlantillas();
  revisarPronto(0);
}

async function cargarDatos() {
  try {
    perfiles = await (await fetch("perfiles.json")).json();
  } catch {
    perfiles = [];
  }
  const nombre = Settings.get("perfil", PERFIL_POR_DEFECTO);
  aplicarPerfil(perfiles.find((p) => p.nombre === nombre) || perfiles.find((p) => p.nombre === PERFIL_POR_DEFECTO) || null);
}

// ---------------------------------------------------------------- listas (programas, ejemplos, perfiles)
const dlgList = $("#dlg-list");
let listaActual = null;

function abrirLista({ titulo, items, buscar = false, hint = "", seleccionado = null }) {
  listaActual = { items, seleccionado };
  $("#list-title").textContent = titulo;
  const search = $("#list-search");
  search.hidden = !buscar;
  search.value = "";
  $("#list-hint").hidden = !hint;
  $("#list-hint").textContent = hint;
  dibujarLista("");
  abrir(dlgList);
  if (buscar && pantallaAncha()) search.focus();
  else $("#list-items").scrollTop = 0;
}

function dibujarLista(filtro) {
  const f = filtro.trim().toLowerCase();
  const cont = $("#list-items");
  cont.innerHTML = "";
  for (const it of listaActual.items) {
    if (f && !(it.titulo + " " + (it.detalle || "")).toLowerCase().includes(f)) continue;
    const row = document.createElement("div");
    row.className = "item" + ((it.clave ?? it.titulo) === listaActual.seleccionado ? " selected" : "");
    row.innerHTML = `<button class="item-main"><strong></strong><small></small></button>`;
    row.querySelector("strong").textContent = it.titulo;
    row.querySelector("small").textContent = it.detalle || "";
    row.querySelector(".item-main").onclick = it.accion;
    if (it.borrar) {
      const del = document.createElement("button");
      del.className = "icon-btn";
      del.setAttribute("aria-label", "Borrar " + it.titulo);
      del.innerHTML = `<svg><use href="#i-trash"/></svg>`;
      del.onclick = it.borrar;
      row.appendChild(del);
    }
    cont.appendChild(row);
  }
  if (!cont.children.length) cont.innerHTML = `<p class="sheet-hint">No hay nada para mostrar.</p>`;
  if (listaActual.seleccionado && !f) cont.querySelector(".selected")?.scrollIntoView({ block: "center" });
}
$("#list-search").addEventListener("input", (e) => dibujarLista(e.target.value));
function cerrarLista() { dlgList.close(); }
dlgList.querySelector("[data-close]").onclick = cerrarLista;

function listaProgramas() {
  const items = Programs.list().map((p) => ({
    titulo: p.nombre,
    detalle: "Modificado " + new Date(p.mod).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }),
    accion: () => { cerrarLista(); abrirPrograma(Programs.get(p.id)); mostrar("code"); },
    borrar: async () => {
      if (!confirm(`¿Borrar "${p.nombre}"? No se puede deshacer.`)) return;
      Programs.remove(p.id);
      if (programa?.id === p.id) {
        const otro = Programs.list()[0];
        abrirPrograma(otro || Programs.create("sin_titulo", plantillaNueva()));
      }
      listaProgramas();
    },
  }));
  abrirLista({ titulo: "Mis programas", items, buscar: items.length > 8, seleccionado: programa?.nombre });
}

async function listaEjemplos() {
  let ejemplos = [];
  try { ejemplos = await (await fetch("ejemplos.json")).json(); } catch { /* sin datos */ }
  abrirLista({
    titulo: "Ejemplos",
    hint: "Se abren como un programa nuevo, adaptado a tu perfil.",
    items: ejemplos.map((e) => ({
      titulo: e.nombre,
      accion: () => {
        cerrarLista();
        abrirPrograma(Programs.create(e.nombre, adaptExample(e.codigo, cfg)));
        mostrar("code");
      },
    })),
  });
}

function listaPerfiles() {
  abrirLista({
    titulo: "Perfil del lenguaje",
    hint: "Elegí el mismo perfil que usan en tu escuela para que las reglas coincidan con PSeInt de la compu.",
    buscar: true,
    seleccionado: perfilActual?.nombre,
    items: perfiles.map((p) => ({
      clave: p.nombre,
      titulo: p.propio ? `${p.nombre} · solo en PSeInt Móvil` : p.nombre,
      detalle: p.desc,
      accion: () => { aplicarPerfil(p); cerrarLista(); toast("Perfil: " + p.nombre); },
    })),
  });
}

// ---------------------------------------------------------------- archivos
function nombreValido(n) {
  return (n || "").trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}

async function pedirTexto(titulo, valor) {
  const dlg = $("#dlg-prompt");
  $("#prompt-title").textContent = titulo;
  const input = $("#prompt-input");
  input.value = valor || "";
  dlg.returnValue = "";
  abrir(dlg);
  input.select();
  return new Promise((r) => dlg.addEventListener("close", () => r(dlg.returnValue === "ok" ? input.value : null), { once: true }));
}

function decodificar(buf) {
  // Los .psc de PSeInt en Windows vienen en latin-1; si es UTF-8 valido, se respeta
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("latin1").decode(buf); }
}

function latin1(texto) {
  const out = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    out[i] = c < 256 ? c : 63;
  }
  return out;
}

$("#file-open").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const codigo = decodificar(new Uint8Array(await f.arrayBuffer())).replace(/\r\n?/g, "\n");
  abrirPrograma(Programs.create(nombreValido(f.name.replace(/\.(psc|txt)$/i, "")) || "programa", codigo));
  mostrar("code");
  toast("Abriste " + f.name);
});

async function guardarArchivo() {
  const nombre = (nombreValido(programa.nombre) || "programa") + ".psc";
  // Se guarda en latin-1, como PSeInt de escritorio, para abrirlo sin problemas en la compu
  const bytes = latin1(editor.value.replace(/\n/g, "\r\n"));
  const cap = window.Capacitor;

  // Dentro del APK: se usan los plugins nativos Filesystem y Share de Capacitor
  if (cap?.isNativePlatform?.() && cap.nativePromise) {
    try {
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      const res = await cap.nativePromise("Filesystem", "writeFile", { path: nombre, data: btoa(bin), directory: "CACHE" });
      await cap.nativePromise("Share", "share", { title: nombre, files: [res.uri], dialogTitle: "Guardar o compartir " + nombre });
      return;
    } catch (err) {
      if (!/cancel/i.test(String(err?.message || err))) toast("No se pudo compartir el archivo");
      return;
    }
  }

  const file = new File([bytes], nombre, { type: "text/plain" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombre }); return; }
    catch (err) { if (err?.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$("#prog-name").onclick = async () => {
  const n = nombreValido(await pedirTexto("Nombre del programa", programa.nombre));
  if (!n) return;
  programa = Programs.update(programa.id, { nombre: n });
  $("#prog-name").textContent = n;
};

// ---------------------------------------------------------------- menú
const dlgMenu = $("#dlg-menu");
$("#btn-menu").onclick = () => abrir(dlgMenu);
dlgMenu.addEventListener("click", (e) => { if (e.target === dlgMenu) dlgMenu.close(); });
dlgList.addEventListener("click", (e) => { if (e.target === dlgList) cerrarLista(); });

function setFont(px) {
  px = Math.min(28, Math.max(11, px));
  Settings.set("fuente", px);
  document.documentElement.style.setProperty("--code-size", px + "px");
  editor.refresh(false);
}

dlgMenu.querySelector(".menu-list").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-menu]");
  if (!b) return;
  const accion = b.dataset.menu;
  if (accion === "font+" || accion === "font-") {
    return setFont(Settings.get("fuente", 16) + (accion === "font+" ? 2 : -2));
  }
  // Si la acción abre otro diálogo, ocupa el mismo paso del historial que el menú
  reemplazarProximo = ["new", "programs", "examples", "profile", "about"].includes(accion);
  dlgMenu.close();
  if (accion === "new") {
    const n = nombreValido(await pedirTexto("Nombre del programa nuevo", "sin_titulo"));
    if (!n) return;
    abrirPrograma(Programs.create(n, plantillaNueva().replace("sin_titulo", n.replace(/\W+/g, "_") || "sin_titulo")));
    mostrar("code");
  } else if (accion === "programs") listaProgramas();
  else if (accion === "open") $("#file-open").click();
  else if (accion === "save") guardarArchivo();
  else if (accion === "examples") listaEjemplos();
  else if (accion === "profile") listaPerfiles();
  else if (accion === "about") abrir($("#dlg-about"));
});

// ---------------------------------------------------------------- utilidades
let toastTimer = null;
function toast(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// Atajo de teclado (teclado físico o compu): Ctrl+Enter o F9 ejecuta
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey && e.key === "Enter") || e.key === "F9") { e.preventDefault(); ejecutar(); }
});

// ---------------------------------------------------------------- inicio
setFont(Settings.get("fuente", 16));
await cargarDatos();
const ultimo = Programs.current() && Programs.get(Programs.current());
abrirPrograma(ultimo || Programs.list()[0] || Programs.create("sin_titulo", plantillaNueva()));

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
