// Editor de pseudocodigo liviano y pensado para el teclado del celular:
// un <textarea> real (asi funcionan el teclado, el corrector, copiar/pegar y
// deshacer de Android) con el coloreado dibujado debajo.

const KEYWORDS = [
  "algoritmo", "finalgoritmo", "proceso", "finproceso", "subalgoritmo", "finsubalgoritmo",
  "subproceso", "finsubproceso", "funcion", "finfuncion", "función", "finfunción",
  "definir", "como", "dimension", "dimensión", "escribir", "imprimir", "mostrar", "leer",
  "si", "entonces", "sino", "finsi", "segun", "según", "hacer", "de", "otro", "modo", "finsegun",
  "finsegún", "mientras", "finmientras", "repetir", "hasta", "que", "para", "con", "paso",
  "finpara", "cada", "esperar", "tecla", "segundos", "segundo", "milisegundos", "milisegundo",
  "limpiar", "borrar", "pantalla", "sin", "saltar", "bajar", "por", "referencia", "valor",
  "es", "opcion", "opción", "caso", "retornar",
];
const TYPES = [
  "entero", "entera", "enteros", "real", "reales", "numero", "número", "numeros", "números",
  "numerico", "numérico", "numerica", "numérica", "caracter", "carácter", "caracteres",
  "texto", "cadena", "cadenas", "logico", "lógico", "logica", "lógica", "logicos", "lógicos",
];
const CONSTS = ["verdadero", "falso", "pi"];
const WORD_OPS = ["y", "o", "no", "mod"];
const FUNCS = [
  "rc", "raiz", "raíz", "abs", "ln", "exp", "sen", "cos", "tan", "asen", "acos", "atan",
  "trunc", "redon", "azar", "aleatorio", "longitud", "subcadena", "mayusculas", "mayúsculas",
  "minusculas", "minúsculas", "concatenar", "convertiranumero", "convertiranúmero",
  "convertiratexto",
];

const kw = new Set(KEYWORDS), ty = new Set(TYPES), ct = new Set(CONSTS),
  wo = new Set(WORD_OPS), fn = new Set(FUNCS);

const TOKEN = /(\/\/.*$)|("[^"]*"?|'[^']*'?)|(\d+(?:\.\d+)?)|([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*)|(<-|<=|>=|<>|==|[-+*/^%=<>&|~])/g;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function highlightLine(line) {
  let html = "", last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    html += esc(line.slice(last, m.index));
    const t = m[0];
    let cls = null;
    if (m[1]) cls = "c";
    else if (m[2]) cls = "s";
    else if (m[3]) cls = "n";
    else if (m[4]) {
      const l = t.toLowerCase();
      if (kw.has(l)) cls = "k";
      else if (ty.has(l)) cls = "t";
      else if (ct.has(l)) cls = "n";
      else if (wo.has(l)) cls = "o";
      else if (fn.has(l)) cls = "f";
    } else if (m[5]) cls = "o";
    html += cls ? `<span class="tk-${cls}">${esc(t)}</span>` : esc(t);
    last = m.index + t.length;
  }
  return html + esc(line.slice(last));
}

// ---- Sangria automatica -------------------------------------------------
// Cada bloque tiene su apertura y su cierre; SiNo y De Otro Modo van "en el medio".
const OPEN = {
  si: /^si\b.*\bentonces\b/i,
  mientras: /^mientras\b(?!\s+que\b)/i,
  para: /^para\b/i,
  repetir: /^repetir\b/i,
  segun: /^seg[uú]n\b/i,
  alg: /^(algoritmo|proceso)\b/i,
  sub: /^(sub\s*algoritmo|sub\s*proceso|funci[oó]n)\b/i,
};
const CLOSE = {
  si: /^fin\s*si\b/i,
  mientras: /^fin\s*mientras\b/i,
  para: /^fin\s*para\b/i,
  repetir: /^(hasta\s+que|mientras\s+que)\b/i,
  segun: /^fin\s*seg[uú]n\b/i,
  alg: /^fin\s*(algoritmo|proceso)\b/i,
  sub: /^fin\s*(sub\s*algoritmo|sub\s*proceso|funci[oó]n)\b/i,
};
const MIDDLE = { si: /^sino\b/i, segun: /^de\s+otro\s+modo\b/i };
const CASE_LABEL = /^[^/"']*:\s*$/; // "1:", "2, 3:" dentro de un Segun

function classify(t) {
  for (const k in CLOSE) if (CLOSE[k].test(t)) return { kind: "close", type: k };
  for (const k in MIDDLE) if (MIDDLE[k].test(t)) return { kind: "middle", type: k };
  for (const k in OPEN) if (OPEN[k].test(t)) return { kind: "open", type: k };
  if (CASE_LABEL.test(t)) return { kind: "label" };
  return { kind: "plain" };
}

const indentOf = (l) => l.match(/^[\t ]*/)[0];

// Busca hacia arriba la apertura que corresponde, salteando bloques anidados del mismo tipo
function openerIndent(lines, from, type) {
  let depth = 0;
  for (let i = from; i >= 0; i--) {
    const t = lines[i].trim();
    if (CLOSE[type].test(t)) depth++;
    else if (OPEN[type].test(t)) {
      if (depth === 0) return indentOf(lines[i]);
      depth--;
    }
  }
  return null;
}

/**
 * Que hacer al apretar Enter. Devuelve la sangria corregida del renglon actual
 * (si es un cierre como FinSi) y la sangria del renglon nuevo.
 */
export function enterIndent(text, caret) {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const lineEnd = text.indexOf("\n", lineStart);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const indent = indentOf(line);
  const t = line.trim();
  const c = classify(t);
  const prev = text.slice(0, lineStart).split("\n").slice(0, -1);

  if (c.kind === "label") { c.kind = "middle"; c.type = "segun"; } // "2, 3:" se alinea con las otras opciones
  if (c.kind === "close" || c.kind === "middle") {
    let target = openerIndent(prev, prev.length - 1, c.type);
    if (target === null) return { fix: null, next: indent + (c.kind === "middle" ? "\t" : "") };
    if (c.kind === "middle" && c.type === "segun") target += "\t";
    return {
      fix: target === indent ? null : { start: lineStart, end: lineStart + indent.length, text: target },
      next: c.kind === "middle" ? target + "\t" : target,
    };
  }
  if (t.startsWith("//")) return { fix: null, next: indent };
  return { fix: null, next: indent + (c.kind === "open" ? "\t" : "") };
}

export class Editor {
  constructor(root, { onChange } = {}) {
    this.root = root;
    this.onChange = onChange || (() => {});
    this.errors = new Map(); // linea (1..n) -> mensaje

    root.classList.add("editor");
    root.innerHTML = `
      <div class="ed-gutter" aria-hidden="true"></div>
      <div class="ed-body">
        <pre class="ed-highlight" aria-hidden="true"></pre>
        <textarea class="ed-input" spellcheck="false" autocapitalize="off"
          autocomplete="off" autocorrect="off" wrap="off"
          aria-label="Código del programa"></textarea>
      </div>`;
    this.gutter = root.querySelector(".ed-gutter");
    this.hl = root.querySelector(".ed-highlight");
    this.ta = root.querySelector(".ed-input");

    this.ta.addEventListener("input", () => this.refresh(true));
    this.ta.addEventListener("keydown", (e) => this.onKey(e));
    this.ta.addEventListener("beforeinput", (e) => this.onBeforeInput(e));
    this.gutter.addEventListener("click", (e) => {
      const n = e.target.closest("[data-line]");
      if (n && this.errors.has(+n.dataset.line)) this.onErrorTap?.(+n.dataset.line, this.errors.get(+n.dataset.line));
    });
    this.refresh(false);
  }

  get value() { return this.ta.value; }
  set value(v) {
    this.ta.value = v;
    this.ta.setSelectionRange(0, 0);
    this.root.scrollTop = 0;
    this.root.scrollLeft = 0;
    this.refresh(false);
  }

  focus() { this.ta.focus({ preventScroll: true }); }

  setErrors(list) {
    this.errors = new Map();
    for (const e of list) {
      if (!this.errors.has(e.line)) this.errors.set(e.line, e.msg);
    }
    this.refresh(false);
  }

  refresh(changed) {
    const lines = this.ta.value.split("\n");
    this.hl.innerHTML = lines
      .map((l, i) => `<div class="ed-line${this.errors.has(i + 1) ? " has-error" : ""}">${highlightLine(l) || " "}</div>`)
      .join("");
    let g = "";
    for (let i = 1; i <= lines.length; i++) {
      g += `<div data-line="${i}"${this.errors.has(i) ? ` class="err" title="${esc(this.errors.get(i))}"` : ""}>${i}</div>`;
    }
    this.gutter.innerHTML = g;
    // El textarea crece con el contenido; el contenedor es el que hace scroll
    this.ta.style.height = "0px";
    this.ta.style.width = "0px";
    this.ta.style.height = Math.max(this.hl.scrollHeight, this.ta.scrollHeight) + "px";
    this.ta.style.width = Math.max(this.hl.scrollWidth, this.ta.scrollWidth) + "px";
    if (changed) this.onChange(this.ta.value);
  }

  // Inserta texto donde esta el cursor, conservando deshacer/rehacer
  insert(text) {
    this.ta.focus({ preventScroll: true });
    if (!document.execCommand("insertText", false, text)) {
      this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, "end");
      this.ta.dispatchEvent(new Event("input"));
    }
    this.ensureCaretVisible();
  }

  /** Inserta una plantilla; "▮" marca donde queda el cursor. Respeta la indentacion. */
  insertTemplate(tpl) {
    const ta = this.ta;
    const before = ta.value.slice(0, ta.selectionStart);
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);
    const indent = currentLine.match(/^[\t ]*/)[0];
    let text = tpl.replace(/\n/g, "\n" + indent);
    // Si el renglon tiene algo escrito, la plantilla va en un renglon nuevo
    if (currentLine.trim() !== "" && tpl.includes("\n")) text = "\n" + indent + text;
    const caret = text.indexOf("▮");
    text = text.replace("▮", "");
    const start = ta.selectionStart;
    this.insert(text);
    if (caret >= 0) ta.setSelectionRange(start + caret, start + caret);
    this.ensureCaretVisible();
  }

  undo() { this.ta.focus(); document.execCommand("undo"); }
  redo() { this.ta.focus(); document.execCommand("redo"); }

  goToLine(n) {
    const lines = this.ta.value.split("\n");
    let pos = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    const end = pos + (lines[n - 1] || "").length;
    this.ta.focus({ preventScroll: true });
    this.ta.setSelectionRange(end, end);
    const lh = parseFloat(getComputedStyle(this.ta).lineHeight) || 20;
    this.root.scrollTop = Math.max(0, (n - 3) * lh);
    this.root.scrollLeft = 0;
  }

  ensureCaretVisible() {
    const ta = this.ta;
    const before = ta.value.slice(0, ta.selectionStart);
    const line = before.split("\n").length;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const y = (line - 1) * lh;
    const r = this.root;
    if (y < r.scrollTop) r.scrollTop = y;
    else if (y + lh * 2 > r.scrollTop + r.clientHeight) r.scrollTop = y + lh * 2 - r.clientHeight;
  }

  newLineWithIndent() {
    const ta = this.ta;
    const { fix, next } = enterIndent(ta.value, ta.selectionStart);
    if (fix) {
      // Corrige la sangria de FinSi, SiNo, etc. antes de bajar de renglon
      const caret = ta.selectionStart, delta = fix.text.length - (fix.end - fix.start);
      ta.setSelectionRange(fix.start, fix.end);
      this.insert(fix.text);
      ta.setSelectionRange(caret + delta, caret + delta);
    }
    this.insert("\n" + next);
  }

  onBeforeInput(e) {
    // En Android el Enter del teclado llega aca (keydown suele venir como 229)
    if (e.inputType === "insertLineBreak" || (e.inputType === "insertText" && e.data === "\n")) {
      e.preventDefault();
      this.newLineWithIndent();
    }
  }

  onKey(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      this.insert("\t");
    } else if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      this.newLineWithIndent();
    }
  }
}
