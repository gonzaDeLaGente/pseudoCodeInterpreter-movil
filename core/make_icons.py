#!/usr/bin/env python3
"""Genera los íconos de la app (web/icons). Solo hace falta correrlo si cambiás el diseño.

Diseño: el operador de asignación de PSeInt "<-" sobre fondo verde azulado.
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "icons"
BG = (15, 118, 110)
FG = (255, 255, 255)
CURSOR = (153, 246, 228)


def draw(size, maskable=False):
    s = 4  # dibujar más grande y achicar: bordes suaves
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, W, W], fill=BG)
        scale = 0.62  # zona segura del ícono adaptable de Android
    else:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.22), fill=BG)
        scale = 0.8
    u = W * scale / 100  # unidades de diseño: 100x100 centradas
    ox = oy = (W - 100 * u) / 2
    P = lambda x, y: (ox + x * u, oy + y * u)
    lw = int(9 * u)
    # "<"
    d.line([P(36, 30), P(14, 50), P(36, 70)], fill=FG, width=lw, joint="curve")
    for x, y in [(36, 30), (14, 50), (36, 70)]:
        d.ellipse([P(x - 4.5, y - 4.5), P(x + 4.5, y + 4.5)], fill=FG)
    # "-"
    d.line([P(46, 50), P(70, 50)], fill=FG, width=lw)
    for x in (46, 70):
        d.ellipse([P(x - 4.5, 45.5), P(x + 4.5, 54.5)], fill=FG)
    # cursor de texto
    d.rounded_rectangle([P(80, 28), P(88, 72)], radius=int(2 * u), fill=CURSOR)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192).save(OUT / "icon-192.png")
    draw(512).save(OUT / "icon-512.png")
    draw(512, maskable=True).save(OUT / "icon-maskable-512.png")
    draw(1024).save(OUT / "icon-1024.png")  # para generar los íconos del APK
    print("Íconos en", OUT)


if __name__ == "__main__":
    main()
