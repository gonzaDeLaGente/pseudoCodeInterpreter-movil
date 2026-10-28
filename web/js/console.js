// Consola de ejecucion: interpreta los colores ANSI y el protocolo de la
// terminal de PSeInt (ESC[zl = pide una linea, ESC[zk = pide una tecla, etc.)

const FG = { 30: "k", 31: "r", 32: "g", 33: "y", 34: "b", 35: "m", 36: "c", 37: "w" };

export class Console {
  constructor(root, { onLineLink } = {}) {
    this.root = root;
    this.onLineLink = onLineLink || (() => {});
    this.pending = "";
    this.cls = "";
    this.cur = null;
    this.inputEl = null;
    this.clear();
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-goto]");
      if (a) this.onLineLink(+a.dataset.goto);
      else if (this.inputEl) this.inputEl.focus();
    });
  }

  clear() {
    this.root.innerHTML = "";
    this.cur = null;
    this.pending = "";
  }

  span(text) {
    if (!text) return;
    if (!this.cur || this.cur.dataset.cls !== this.cls) {
      this.cur = document.createElement("span");
      this.cur.dataset.cls = this.cls;
      if (this.cls) this.cur.className = this.cls;
      this.root.appendChild(this.cur);
    }
    this.cur.textContent += text;
  }

  sgr(params) {
    let bold = this.cls.includes("bold");
    let fg = (this.cls.match(/fg-(\w)/) || [])[1] || "";
    for (const p of params.split(";").map(Number)) {
      if (p === 0) { bold = false; fg = ""; }
      else if (p === 1) bold = true;
      else if (FG[p]) fg = FG[p];
      // los colores de fondo (40-47) se ignoran: la consola usa el tema de la app
    }
    this.cls = [bold ? "bold" : "", fg ? "fg-" + fg : ""].filter(Boolean).join(" ");
  }

  /** Agrega salida del interprete. Devuelve los pedidos de entrada detectados. */
  write(data) {
    let s = this.pending + data;
    this.pending = "";
    let i = 0, text = "";
    const flush = () => { this.span(text); text = ""; };
    while (i < s.length) {
      const ch = s[i];
      if (ch !== "\x1b") { text += ch; i++; continue; }
      // secuencia incompleta al final: esperar al proximo pedazo
      const rest = s.slice(i);
      let m;
      if ((m = rest.match(/^\x1b\[([0-9;]*)m/))) { flush(); this.sgr(m[1]); }
      else if ((m = rest.match(/^\x1b\[2J/))) { flush(); this.clear(); }
      else if ((m = rest.match(/^\x1b\[\d*;?\d*H/))) { flush(); }
      else if ((m = rest.match(/^\x1b\[\?25[hl]/))) { flush(); }
      else if ((m = rest.match(/^\x1b\[z[lk]/))) { flush(); }
      else if ((m = rest.match(/^\x1b\[z[pes]-?\d+:-?\d+;/))) { flush(); }
      else if ((m = rest.match(/^\x1b\[zt[^\n]*\n/))) { flush(); }
      else if ((m = rest.match(/^\x1b\]0;[^\x07]*\x07/))) { flush(); }
      else if (/^\x1b(\[[^a-zA-Z]*)?$/.test(rest) || /^\x1b\[z[^\n]*$/.test(rest) || /^\x1b\]0;[^\x07]*$/.test(rest)) {
        this.pending = rest;
        break;
      } else { i++; continue; } // secuencia desconocida: se descarta el ESC
      i += m[0].length;
    }
    flush();
    this.linkErrors();
    this.scroll();
  }

  // "Lin 12 (inst 1): ERROR ..." se vuelve tocable para ir a esa linea del codigo
  linkErrors() {
    for (const el of this.root.querySelectorAll("span:not([data-linked])")) {
      if (el === this.cur) continue;
      el.dataset.linked = "1";
      if (/Lin \d+ \(inst/.test(el.textContent)) {
        el.innerHTML = el.textContent
          .replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/Lin (\d+) \(inst \d+\)/g, '<a href="#" data-goto="$1">$&</a>');
      }
    }
  }

  finish() {
    if (this.cur) this.cur.dataset.cls = "__closed";
    this.cur = null;
    this.linkErrors();
  }

  scroll() {
    this.root.scrollTop = this.root.scrollHeight;
  }

  /** Muestra un campo para Leer. Devuelve una promesa con lo que escribio el alumno. */
  askLine() {
    return new Promise((resolve) => {
      const wrap = document.createElement("form");
      wrap.className = "con-input";
      wrap.innerHTML = `<input type="text" enterkeyhint="send" autocomplete="off"
        autocapitalize="off" spellcheck="false" aria-label="Valor a ingresar">
        <button type="submit" aria-label="Enviar">↵</button>`;
      const input = wrap.querySelector("input");
      this.cur = null;
      this.root.appendChild(wrap);
      this.inputEl = input;
      wrap.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = input.value;
        const echo = document.createElement("span");
        echo.className = "echo";
        echo.textContent = v + "\n";
        wrap.replaceWith(echo);
        this.inputEl = null;
        resolve(v);
      });
      this.scroll();
      input.focus({ preventScroll: true });
    });
  }

  /** Esperar Tecla: cualquier tecla o un toque continua. */
  askKey() {
    return new Promise((resolve) => {
      const btn = document.createElement("button");
      btn.className = "con-key";
      btn.type = "button";
      btn.textContent = "Tocá para continuar";
      this.cur = null;
      this.root.appendChild(btn);
      const done = (k) => {
        document.removeEventListener("keydown", onKey, true);
        btn.remove();
        resolve(k);
      };
      const onKey = (e) => { e.preventDefault(); done(e.key.length === 1 ? e.key : "\n"); };
      document.addEventListener("keydown", onKey, true);
      btn.addEventListener("click", () => done("\n"));
      this.scroll();
      btn.focus({ preventScroll: true });
    });
  }

  cancelInput() {
    this.root.querySelectorAll(".con-input, .con-key").forEach((el) => el.remove());
    this.inputEl = null;
  }

  note(text, cls = "note") {
    this.cur = null;
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    this.root.appendChild(el);
    this.scroll();
  }
}
