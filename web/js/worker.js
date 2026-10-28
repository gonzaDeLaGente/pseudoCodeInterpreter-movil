// Corre el interprete en segundo plano para que la pantalla nunca se congele
// (un bucle infinito del alumno se corta con el boton Detener).
import { runPseint } from "./pseint-runtime.js";

let modulePromise = null;
let pendingInput = null;

function getModule() {
  if (!modulePromise) {
    const url = new URL("../pseint.wasm", import.meta.url);
    const lento = () => fetch(url).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b));
    // compileStreaming necesita que el servidor mande el tipo application/wasm
    modulePromise = WebAssembly.compileStreaming
      ? WebAssembly.compileStreaming(fetch(url)).catch(lento)
      : lento();
  }
  return modulePromise;
}

self.onmessage = async (ev) => {
  const msg = ev.data;

  if (msg.type === "input" && pendingInput) {
    const resolve = pendingInput;
    pendingInput = null;
    resolve(msg.text);
    return;
  }

  if (msg.type === "run" || msg.type === "check") {
    const { id, source, profile } = msg;
    try {
      const module = await getModule();
      let out = "";
      const args = msg.type === "run"
        ? ["--forpseintterminal", "--color"]
        : ["--norun", "--nouser"];
      // La salida se junta y se manda cada pocos ms: muchos mensajes chicos son lentos
      let timer = null;
      const flush = () => {
        timer = null;
        if (out) self.postMessage({ type: "output", id, text: out });
        out = "";
      };
      const code = await runPseint({
        module,
        source,
        profile,
        args,
        onOutput: (t) => {
          out += t;
          if (msg.type === "run" && !timer) timer = setTimeout(flush, 16);
        },
        requestInput: (kind) => {
          flush();
          self.postMessage({ type: "input-request", id, kind });
          return new Promise((r) => (pendingInput = r));
        },
      });
      if (timer) clearTimeout(timer);
      if (msg.type === "check") self.postMessage({ type: "check-result", id, text: out });
      else {
        flush();
        self.postMessage({ type: "exit", id, code });
      }
    } catch (e) {
      self.postMessage({ type: "crash", id, message: String(e && e.message || e) });
    }
  }
};
