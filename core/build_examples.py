#!/usr/bin/env python3
"""Junta los ejemplos que trae PSeInt (bin/ejemplos/*.psc) en un JSON para la app.

Uso: python3 build_examples.py <carpeta ejemplos> <salida.json>
"""
import json
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    carpeta, salida = Path(sys.argv[1]), Path(sys.argv[2])
    ejemplos = []
    for p in sorted(carpeta.glob("*.psc"), key=lambda p: p.name.lower()):
        texto = p.read_text(encoding="latin-1").replace("\r\n", "\n").replace("\r", "\n")
        ejemplos.append({"nombre": p.stem, "codigo": texto})
    salida.write_text(json.dumps(ejemplos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(ejemplos)} ejemplos -> {salida}")


if __name__ == "__main__":
    main()
