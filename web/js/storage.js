// Programas del alumno guardados en el celular (localStorage)

const KEY = "pm.programas";
const KEY_ACTUAL = "pm.actual";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sin espacio o bloqueado */ }
}

export const Programs = {
  list() {
    return load().sort((a, b) => b.mod - a.mod);
  },
  get(id) {
    return load().find((p) => p.id === id) || null;
  },
  create(nombre, codigo) {
    const list = load();
    const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nombre, codigo, mod: Date.now() };
    list.push(p);
    save(list);
    this.setCurrent(p.id);
    return p;
  },
  update(id, fields) {
    const list = load();
    const p = list.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, fields, { mod: Date.now() });
    save(list);
    return p;
  },
  remove(id) {
    save(load().filter((p) => p.id !== id));
  },
  current() {
    try { return localStorage.getItem(KEY_ACTUAL); } catch { return null; }
  },
  setCurrent(id) {
    try { localStorage.setItem(KEY_ACTUAL, id); } catch { /* nada */ }
  },
};

export const Settings = {
  get(k, def) {
    try {
      const v = localStorage.getItem("pm." + k);
      return v === null ? def : JSON.parse(v);
    } catch { return def; }
  },
  set(k, v) {
    try { localStorage.setItem("pm." + k, JSON.stringify(v)); } catch { /* nada */ }
  },
};
