#!/usr/bin/env python3
"""Copia el ícono de la app al proyecto Android que genera Capacitor.

Uso: python3 core/android_icons.py android
(se corre después de "npx cap add android"; el workflow lo hace solo)
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "web" / "icons" / "icon-1024.png"
MASK = ROOT / "web" / "icons" / "icon-maskable-512.png"
BG_COLOR = "#0F766E"
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    res = Path(sys.argv[1]) / "app" / "src" / "main" / "res"
    if not res.is_dir():
        sys.exit(f"No encontré {res}. ¿Corriste 'npx cap add android'?")

    icono = Image.open(ICON).convert("RGBA")
    # Para el ícono adaptable: el dibujo sin fondo, que Android recorta con su máscara
    frente = Image.open(MASK).convert("RGBA")
    datos = frente.load()
    fondo = frente.getpixel((2, 2))
    for y in range(frente.height):
        for x in range(frente.width):
            if datos[x, y][:3] == fondo[:3]:
                datos[x, y] = (0, 0, 0, 0)

    for nombre, f in DENSIDADES.items():
        carpeta = res / f"mipmap-{nombre}"
        carpeta.mkdir(parents=True, exist_ok=True)
        lado = round(48 * f)
        icono.resize((lado, lado), Image.LANCZOS).save(carpeta / "ic_launcher.png")
        icono.resize((lado, lado), Image.LANCZOS).save(carpeta / "ic_launcher_round.png")
        lado_fg = round(108 * f)
        frente.resize((lado_fg, lado_fg), Image.LANCZOS).save(carpeta / "ic_launcher_foreground.png")

    valores = res / "values" / "ic_launcher_background.xml"
    valores.parent.mkdir(parents=True, exist_ok=True)
    valores.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{BG_COLOR}</color>\n</resources>\n',
        encoding="utf-8",
    )
    print("Íconos de Android actualizados en", res)


if __name__ == "__main__":
    main()
