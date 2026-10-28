#!/usr/bin/env bash
# Compila el interprete de PSeInt a WebAssembly.
#
# Variables de entorno:
#   PSEINT_SRC  carpeta del codigo original de PSeInt (la que contiene pseint/ y bin/)
#   WASI_SDK    carpeta de wasi-sdk (https://github.com/WebAssembly/wasi-sdk)
#   WASM_OPT    ruta a wasm-opt de binaryen (por defecto, el del paquete npm "binaryen")
#   OUT         carpeta de salida (por defecto: web/)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
: "${PSEINT_SRC:?Defini PSEINT_SRC con la carpeta del codigo de PSeInt}"
: "${WASI_SDK:?Defini WASI_SDK con la carpeta de wasi-sdk}"
WASM_OPT="${WASM_OPT:-$ROOT/node_modules/.bin/wasm-opt}"
OUT="${OUT:-$ROOT/web}"

SRC="$PSEINT_SRC/pseint"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

echo "==> Adaptando el codigo"
cp -r "$SRC" "$BUILD/pseint"
mkdir -p "$BUILD/wxPSeInt" && cp "$PSEINT_SRC/wxPSeInt/string_conversions.h" "$BUILD/wxPSeInt/"
command -v patch >/dev/null || { echo "Falta el programa 'patch' (en Debian: sudo apt install patch)"; exit 1; }
python3 "$HERE/patch_pseint.py" "$BUILD/pseint"

echo "==> Compilando a WebAssembly"
# zockets.cpp (depurador por red) y zcurlib_win.cpp (consola de Windows) no hacen falta
FILES=$(cd "$BUILD/pseint" && ls *.cpp | grep -v -E '^(zockets|zcurlib_win)\.cpp$')
(cd "$BUILD/pseint" && "$WASI_SDK/bin/clang++" \
  --target=wasm32-wasip1 --sysroot="$WASI_SDK/share/wasi-sysroot" \
  -O2 -w -fno-exceptions -DNDEBUG -D_WASI_EMULATED_SIGNAL \
  -Wl,-z,stack-size=1048576 -Wl,--export=malloc \
  -o "$BUILD/pseint.raw.wasm" $FILES -lwasi-emulated-signal)

echo "==> Habilitando la pausa para Leer (Asyncify)"
# fd_read (Leer) y poll_oneoff (Esperar) son las llamadas que pausan: Asyncify permite
# suspender el interprete mientras el alumno escribe, sin bloquear la pagina.
"$WASM_OPT" "$BUILD/pseint.raw.wasm" -O2 --asyncify \
  --pass-arg=asyncify-imports@wasi_snapshot_preview1.fd_read,wasi_snapshot_preview1.poll_oneoff \
  -o "$OUT/pseint.wasm"

echo "==> Generando perfiles y ejemplos"
python3 "$HERE/build_profiles.py" "$OUT/perfiles.json" "$PSEINT_SRC/bin/perfiles" "$HERE/perfiles"
python3 "$HERE/build_examples.py" "$PSEINT_SRC/bin/ejemplos" "$OUT/ejemplos.json"
mkdir -p "$OUT/fonts" && cp "$PSEINT_SRC/bin/Inconsolata-Regular.ttf" "$OUT/fonts/"

ls -l "$OUT/pseint.wasm" "$OUT/perfiles.json" "$OUT/ejemplos.json"
echo "Listo."
