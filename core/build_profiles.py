#!/usr/bin/env python3
"""Convierte la carpeta de perfiles de PSeInt (bin/perfiles) en un unico JSON.

Uso: python3 build_profiles.py <salida.json> <carpeta perfiles> [<otra carpeta>...]

Se usan los perfiles de PSeInt (bin/perfiles) y los propios de la app (core/perfiles).

Cada perfil queda como {"nombre", "desc", "texto"}. La app le pasa "texto" al
interprete como archivo (--profile=...), asi PSeInt lo interpreta igual que en la PC,
incluidas las correcciones para perfiles viejos.
"""
import json
import sys
from pathlib import Path

def leer(path: Path):
    texto = path.read_text(encoding="latin-1").replace("\r\n", "\n").replace("\r", "\n")
    desc = " ".join(l[5:].strip() for l in texto.splitlines() if l.startswith("desc="))
    return {"nombre": path.name, "desc": desc, "texto": texto}


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    salida = Path(sys.argv[1])
    perfiles = []
    # Los perfiles propios (carpetas extra) van primero en la lista, marcados como "propio"
    for i, carpeta in enumerate(reversed(sys.argv[2:])):
        propio = i < len(sys.argv) - 3
        for p in sorted(Path(carpeta).iterdir(), key=lambda p: p.name.lower()):
            if p.is_file():
                perfiles.append({**leer(p), **({"propio": True} if propio else {})})
    salida.write_text(json.dumps(perfiles, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(perfiles)} perfiles -> {salida}")


if __name__ == "__main__":
    main()
