// Lectura de perfiles de PSeInt y adaptacion de los ejemplos a cada perfil.

// Valores por defecto del interprete (LangSettings.cpp) para las opciones que
// usan los ejemplos.
const DEFAULTS = {
  force_semicolon: false,
  word_operators: true,
  base_zero_arrays: false,
  force_define_vars: false,
  prefer_algoritmo: true,
  prefer_funcion: true,
  allow_return: false, // opción propia de PSeInt Móvil (perfil "Estilo Java")
};

export function parseProfile(texto) {
  const cfg = { ...DEFAULTS };
  let version = 0;
  for (const linea of (texto || "").split("\n")) {
    const i = linea.indexOf("=");
    if (i < 0) continue;
    const k = linea.slice(0, i).trim();
    const v = linea.slice(i + 1).trim();
    if (k === "version") version = parseInt(v, 10) || 0;
    else if (k in cfg) cfg[k] = v === "1";
  }
  // Mismo ajuste que hace PSeInt con perfiles anteriores a 2016
  if (version && version < 20160321) cfg.prefer_algoritmo = cfg.prefer_funcion = false;
  return cfg;
}

/**
 * Los ejemplos de PSeInt traen marcas como {Proceso}, {;} o {1#0} que el editor
 * original reemplaza segun el perfil. Esta es la misma logica que
 * mxSource::SetExample() de wxPSeInt.
 */
export function adaptExample(codigo, cfg) {
  const proceso = cfg.prefer_algoritmo ? "Algoritmo" : "Proceso";
  const finproceso = cfg.prefer_algoritmo ? "FinAlgoritmo" : "FinProceso";
  const sub = cfg.prefer_funcion ? "Funcion" : cfg.prefer_algoritmo ? "SubAlgoritmo" : "SubProceso";
  const finsub = cfg.prefer_funcion ? "FinFuncion" : cfg.prefer_algoritmo ? "FinSubAlgoritmo" : "FinSubProceso";
  const simple = {
    ";": cfg.force_semicolon ? ";" : "",
    "&": cfg.word_operators ? "Y" : "&",
    "|": cfg.word_operators ? "O" : "|",
    "~": cfg.word_operators ? "NO" : "~",
    "%": cfg.word_operators ? "MOD" : "%",
    PROCESO: proceso,
    FINPROCESO: finproceso,
    SUBPROCESO: sub,
    FINSUBPROCESO: finsub,
  };

  // Las dos primeras lineas son un aviso para abrirlos desde el menu de ayuda
  const lineas = codigo.split("\n").slice(2);
  const out = [];
  for (let str of lineas) {
    let borrar = false;
    let p0 = str.indexOf("{");
    while (p0 !== -1) {
      const p2 = str.indexOf("}", p0);
      if (p2 === -1) break;
      const dentro = str.slice(p0 + 1, p2);
      const hash = dentro.indexOf("#");
      let reemplazo;
      if (hash !== -1) {
        reemplazo = cfg.base_zero_arrays ? dentro.slice(hash + 1) : dentro.slice(0, hash);
      } else if (dentro.toUpperCase() in simple && (dentro.length === 1 || /^[a-z]+$/i.test(dentro))) {
        reemplazo = simple[dentro.toUpperCase()];
      } else if (/^definir /i.test(dentro)) {
        if (cfg.force_define_vars) reemplazo = dentro;
        else { borrar = true; break; }
      } else {
        reemplazo = dentro;
      }
      str = str.slice(0, p0) + reemplazo + str.slice(p2 + 1);
      p0 = str.indexOf("{");
    }
    if (!borrar) out.push(str);
  }
  return out.join("\n");
}
