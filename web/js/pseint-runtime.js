/*
 * Ejecuta el interprete de PSeInt (compilado a WebAssembly/WASI) sin servidor.
 *
 * Implementa solo las llamadas WASI que usa PSeInt:
 *   - stdout/stderr -> onOutput(texto)
 *   - stdin         -> requestInput(tipo) (Promise), pausando el interprete con Asyncify
 *   - un archivo en memoria con el programa (/programa.psc)
 *   - "Esperar X segundos" tambien pausa con Asyncify en lugar de bloquear
 *
 * Funciona igual en un Web Worker del navegador y en Node (para las pruebas).
 */

const ERRNO = { SUCCESS: 0, BADF: 8, INVAL: 28, NOENT: 44, NOSYS: 52, SPIPE: 70 };
const FILETYPE = { CHAR: 2, DIR: 3, FILE: 4 };
const ASYNC_DATA_SIZE = 64 * 1024; // pila de Asyncify para guardar el estado al pausar

// PSeInt trabaja en ISO-8859-1 (latin-1), como el editor original
export function encodeLatin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out[i] = c < 256 ? c : 63; // '?' para lo que no existe en latin-1
  }
  return out;
}

export function decodeLatin1(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return s;
}

class Exit {
  constructor(code) { this.code = code; }
}

/**
 * @param {object} opts
 * @param {WebAssembly.Module} opts.module   modulo ya compilado de pseint.wasm
 * @param {string} opts.source               codigo del alumno
 * @param {string} [opts.profile]            texto de un perfil de PSeInt (bin/perfiles)
 * @param {string[]} opts.args               opciones extra para el interprete
 * @param {(text:string)=>void} opts.onOutput
 * @param {(kind:'line'|'key')=>Promise<string>} opts.requestInput
 * @returns {Promise<number>} codigo de salida
 */
export async function runPseint({ module, source, profile, args = [], onOutput, requestInput }) {
  const argv = ["pseint", "/programa.psc", ...(profile ? ["--profile=/perfil.txt"] : []), ...args];
  const memFiles = {
    "programa.psc": encodeLatin1(source.replace(/\r\n?/g, "\n")),
    "perfil.txt": encodeLatin1(profile || ""),
  };

  let instance, memory, asyncData;
  let stdinBuf = new Uint8Array(0);
  let pendingKind = "line"; // lo marca la secuencia ESC[zl / ESC[zk que emite PSeInt
  let outCarry = "";

  // Estado de la pausa: cuando una llamada necesita esperar, guarda aca la promesa
  let sleeping = null;
  let wakeValue = null;

  const files = new Map(); // fd -> {data, pos}
  let nextFd = 4;

  const view = () => new DataView(memory.buffer);
  const bytes = () => new Uint8Array(memory.buffer);

  function readIovs(iovs, iovsLen) {
    const dv = view();
    const list = [];
    for (let i = 0; i < iovsLen; i++) {
      list.push([dv.getUint32(iovs + i * 8, true), dv.getUint32(iovs + i * 8 + 4, true)]);
    }
    return list;
  }

  function emit(text) {
    // Detecta si PSeInt pide una linea (Leer) o una tecla (Esperar Tecla)
    const all = outCarry + text;
    const re = /\x1b\[z([lk])/g;
    let m;
    while ((m = re.exec(all))) pendingKind = m[1] === "k" ? "key" : "line";
    outCarry = all.slice(-3);
    onOutput(text);
  }

  // Ejecuta "fn" pudiendo pausar: si no hay datos, inicia la pausa y devuelve 0
  function suspendFor(promiseFactory, resume) {
    const state = instance.exports.asyncify_get_state();
    if (state === 2) { // volviendo de la pausa (rewinding)
      instance.exports.asyncify_stop_rewind();
      const v = wakeValue;
      wakeValue = null;
      return resume(v);
    }
    // Primera vez: guardar el estado y salir hasta el bucle de abajo
    const dv = view();
    dv.setUint32(asyncData, asyncData + 8, true);
    dv.setUint32(asyncData + 4, asyncData + ASYNC_DATA_SIZE, true);
    instance.exports.asyncify_start_unwind(asyncData);
    sleeping = promiseFactory();
    return 0;
  }

  const wasi = {
    args_sizes_get(argcPtr, bufSizePtr) {
      const dv = view();
      dv.setUint32(argcPtr, argv.length, true);
      dv.setUint32(bufSizePtr, argv.reduce((n, a) => n + encodeLatin1(a).length + 1, 0), true);
      return ERRNO.SUCCESS;
    },
    args_get(argvPtr, bufPtr) {
      const dv = view(), mem = bytes();
      let p = bufPtr;
      argv.forEach((a, i) => {
        dv.setUint32(argvPtr + i * 4, p, true);
        const b = encodeLatin1(a);
        mem.set(b, p);
        mem[p + b.length] = 0;
        p += b.length + 1;
      });
      return ERRNO.SUCCESS;
    },
    environ_sizes_get(countPtr, sizePtr) {
      view().setUint32(countPtr, 0, true);
      view().setUint32(sizePtr, 0, true);
      return ERRNO.SUCCESS;
    },
    environ_get() { return ERRNO.SUCCESS; },
    clock_time_get(id, precision, timePtr) {
      const ns = BigInt(Math.round((id === 0 ? Date.now() : performance.now()) * 1e6));
      view().setBigUint64(timePtr, ns, true);
      return ERRNO.SUCCESS;
    },
    fd_fdstat_get(fd, statPtr) {
      const dv = view();
      let type;
      if (fd <= 2) type = FILETYPE.CHAR;
      else if (fd === 3) type = FILETYPE.DIR;
      else if (files.has(fd)) type = FILETYPE.FILE;
      else return ERRNO.BADF;
      dv.setUint8(statPtr, type);
      dv.setUint16(statPtr + 2, 0, true);
      dv.setBigUint64(statPtr + 8, 0xffffffffn, true);
      dv.setBigUint64(statPtr + 16, 0xffffffffn, true);
      return ERRNO.SUCCESS;
    },
    fd_fdstat_set_flags() { return ERRNO.SUCCESS; },
    fd_prestat_get(fd, ptr) {
      if (fd !== 3) return ERRNO.BADF;
      view().setUint8(ptr, 0); // preopen de tipo directorio
      view().setUint32(ptr + 4, 1, true); // nombre "/"
      return ERRNO.SUCCESS;
    },
    fd_prestat_dir_name(fd, ptr, len) {
      if (fd !== 3) return ERRNO.BADF;
      bytes()[ptr] = 47; // "/"
      return ERRNO.SUCCESS;
    },
    path_open(dirfd, dirflags, pathPtr, pathLen, oflags, rightsBase, rightsInh, fdflags, fdPtr) {
      const path = decodeLatin1(bytes().slice(pathPtr, pathPtr + pathLen)).replace(/^\/+/, "");
      if (path in memFiles) {
        const fd = nextFd++;
        files.set(fd, { data: memFiles[path], pos: 0 });
        view().setUint32(fdPtr, fd, true);
        return ERRNO.SUCCESS;
      }
      if (oflags & 1) { // O_CREAT: archivos que PSeInt quiera escribir se descartan
        const fd = nextFd++;
        files.set(fd, { data: new Uint8Array(0), pos: 0, sink: true });
        view().setUint32(fdPtr, fd, true);
        return ERRNO.SUCCESS;
      }
      return ERRNO.NOENT;
    },
    fd_close(fd) {
      files.delete(fd);
      return ERRNO.SUCCESS;
    },
    fd_seek(fd, offset, whence, newPosPtr) {
      const f = files.get(fd);
      if (!f) return fd <= 2 ? ERRNO.SPIPE : ERRNO.BADF;
      const off = Number(offset);
      if (whence === 0) f.pos = off;
      else if (whence === 1) f.pos += off;
      else f.pos = f.data.length + off;
      view().setBigUint64(newPosPtr, BigInt(f.pos), true);
      return ERRNO.SUCCESS;
    },
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
      let total = 0;
      const mem = bytes();
      for (const [ptr, len] of readIovs(iovs, iovsLen)) {
        if (fd === 1 || fd === 2) emit(decodeLatin1(mem.slice(ptr, ptr + len)));
        total += len;
      }
      view().setUint32(nwrittenPtr, total, true);
      return ERRNO.SUCCESS;
    },
    fd_read(fd, iovs, iovsLen, nreadPtr) {
      const copy = (src) => {
        let n = 0;
        const mem = bytes();
        for (const [ptr, len] of readIovs(iovs, iovsLen)) {
          const chunk = src.subarray(n, n + len);
          mem.set(chunk, ptr);
          n += chunk.length;
          if (chunk.length < len) break;
        }
        view().setUint32(nreadPtr, n, true);
        return n;
      };

      if (fd === 0) {
        if (stdinBuf.length === 0) {
          return suspendFor(
            () => requestInput(pendingKind).then((txt) => {
              const s = pendingKind === "key" ? (txt || "\n").slice(0, 1) : txt + "\n";
              pendingKind = "line";
              return encodeLatin1(s);
            }),
            (data) => {
              stdinBuf = data;
              const n = copy(stdinBuf);
              stdinBuf = stdinBuf.subarray(n);
              return ERRNO.SUCCESS;
            },
          );
        }
        const n = copy(stdinBuf);
        stdinBuf = stdinBuf.subarray(n);
        return ERRNO.SUCCESS;
      }
      const f = files.get(fd);
      if (!f) return ERRNO.BADF;
      const n = copy(f.data.subarray(f.pos));
      f.pos += n;
      return ERRNO.SUCCESS;
    },
    poll_oneoff(inPtr, outPtr, nsubs, neventsPtr) {
      // Solo se usa para Esperar X (Milisegundos|Segundos): una suscripcion de reloj
      const dv = view();
      let ms = 0;
      for (let i = 0; i < nsubs; i++) {
        const sub = inPtr + i * 48;
        if (dv.getUint8(sub + 8) === 0) { // tipo reloj
          ms = Math.max(ms, Number(dv.getBigUint64(sub + 24, true)) / 1e6);
        }
      }
      const done = () => {
        const d = view();
        d.setBigUint64(outPtr, d.getBigUint64(inPtr, true), true); // userdata
        d.setUint16(outPtr + 8, 0, true);
        d.setUint8(outPtr + 10, 0);
        d.setUint32(neventsPtr, 1, true);
        return ERRNO.SUCCESS;
      };
      return suspendFor(() => new Promise((r) => setTimeout(r, ms)), done);
    },
    proc_exit(code) {
      throw new Exit(code);
    },
  };

  instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi });
  memory = instance.exports.memory;
  asyncData = instance.exports.malloc(ASYNC_DATA_SIZE);

  try {
    for (;;) {
      instance.exports._start();
      if (!sleeping) return 0;
      // El interprete quedo en pausa: esperar al alumno y continuar donde estaba
      instance.exports.asyncify_stop_unwind();
      wakeValue = await sleeping;
      sleeping = null;
      instance.exports.asyncify_start_rewind(asyncData);
    }
  } catch (e) {
    if (e instanceof Exit) return e.code;
    throw e;
  }
}
