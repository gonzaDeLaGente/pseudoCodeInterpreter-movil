#!/usr/bin/env python3
"""Adapta el codigo fuente original de PSeInt para compilarlo a WebAssembly (WASI).

Uso: python3 patch_pseint.py <carpeta pseint/pseint del codigo original>

Cambios para poder compilar (no alteran el comportamiento del interprete):
  * main.cpp: las llamadas al depurador por sockets solo se compilan con USE_ZOCKETS.
  * zcurlib_lnx.cpp: WASI no tiene termios; "Esperar Tecla" lee un caracter de stdin
    (igual que hace PSeInt cuando corre dentro de su propia terminal).

Cambios al lenguaje (solo se activan con opciones de perfil nuevas):
  * retornar.patch: instruccion "Retornar" estilo Java (opcion allow_return).

El script es idempotente: se puede correr varias veces sin romper nada.
"""
import subprocess
import sys
from pathlib import Path

MARK = "/* pseint-movil */"


def patch(path: Path, replacements):
    text = path.read_text(encoding="latin-1")
    if MARK in text:
        print(f"  {path.name}: ya estaba adaptado")
        return
    for old, new in replacements:
        if old not in text:
            sys.exit(f"ERROR: no encontre el fragmento esperado en {path.name}:\n{old}")
        text = text.replace(old, new, 1)
    path.write_text(MARK + "\n" + text, encoding="latin-1")
    print(f"  {path.name}: adaptado")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])

    patch(src / "main.cpp", [
        ("Inter.SetPort(atoi(str.substr(7).c_str()));",
         "{\n#ifdef USE_ZOCKETS\n\t\t\t\tInter.SetPort(atoi(str.substr(7).c_str()));\n#endif\n\t\t\t\t}"),
        ("Inter.InitDebug(delay);",
         "\n#ifdef USE_ZOCKETS\n\tInter.InitDebug(delay);\n#endif\n"),
    ])

    patch(src / "zcurlib_lnx.cpp", [
        ("#ifndef __WIN32__\n#include <termios.h>",
         "#if !defined(__WIN32__) && !defined(__wasi__)\n#include <termios.h>"),
        ("#ifndef __WIN32__\n\nint lnx_getKey(void) {",
         "#if defined(__wasi__)\nint lnx_getKey(void) { return cin.get(); }\n"
         "#elif !defined(__WIN32__)\n\nint lnx_getKey(void) {"),
    ])

    aplicar_parche(src, Path(__file__).with_name("retornar.patch"), marca=src / "Ejecutar.cpp")


def aplicar_parche(src: Path, parche: Path, marca: Path):
    """Aplica un .patch (generado con git diff desde la carpeta raiz de PSeInt)."""
    if "pseint-movil" in marca.read_text(encoding="latin-1"):
        print(f"  {parche.name}: ya estaba aplicado")
        return
    r = subprocess.run(["patch", "-p2", "--forward", "--no-backup-if-mismatch", "-d", str(src), "-i", str(parche.resolve())],
                       capture_output=True, text=True, encoding="latin-1")
    if r.returncode != 0:
        sys.exit(f"ERROR: {parche.name} no se pudo aplicar (¿cambio el codigo de PSeInt?):\n{r.stdout}{r.stderr}")
    print(f"  {parche.name}: aplicado")


if __name__ == "__main__":
    main()
