# PSeInt Móvil

PSeInt para el celular, **usando el intérprete original de PSeInt** compilado a
WebAssembly. No es una imitación: el mismo código en C++ que corre en la PC corre
acá, así que los programas, los mensajes de error y los perfiles se comportan igual.

- Funciona **sin conexión** (como app web instalable o como APK de Android).
- Editor con colores, sangría automática y una barra de símbolos y palabras clave
  sobre el teclado (`<-`, `<>`, `Si…Entonces`, `Mientras`, `Para`…).
- Revisa la sintaxis mientras escribís y marca la línea con error.
- `Leer`, `Esperar`, `Esperar Tecla` y `Limpiar Pantalla` funcionan en la consola.
- Los **385 perfiles** de PSeInt (Flexible, Estricto y los de cada escuela), más el
  perfil propio **Estilo Java** (ver abajo).
- Los 25 ejemplos de PSeInt, adaptados al perfil elegido.
- Abre y guarda archivos `.psc` compatibles con PSeInt de escritorio.

> Versión **no oficial**. PSeInt fue creado por Pablo Novara:
> <https://pseint.sourceforge.net>

## Perfil "Estilo Java": funciones con `Retornar`

En PSeInt, una función devuelve lo que tenga la variable de la cabecera al llegar a
`FinFuncion`. Con el perfil **Estilo Java** se escribe como en Java o Python:

```
Funcion EsPar(n)
    Si n MOD 2 = 0 Entonces
        Retornar Verdadero    // termina la función acá, como return
    FinSi
    Retornar Falso
FinFuncion

Algoritmo Ejemplo
    Escribir EsPar(8)
FinAlgoritmo
```

- `Retornar <expresión>` devuelve el valor y **termina la función en ese momento**,
  aunque esté dentro de un `Si`, `Mientras`, `Para` o `Repetir`.
- En una función que no devuelve nada, `Retornar` solo (sin valor) la termina.
- La forma clásica (`Funcion r <- Doble(x)`) sigue funcionando, y también acepta `Retornar`.
- Errores nuevos, pensados para aprender:
  - 330: `Retornar` fuera de una función.
  - 332: `Retornar` sin valor en una función que devuelve algo.
  - 333: la función terminó sin ejecutar ningún `Retornar` (por ejemplo, faltó el caso del `SiNo`).
  - 334: la función retorna valores de distinto tipo (texto en un lado, número en otro).

Es una opción nueva del intérprete (`allow_return`), apagada en todos los perfiles
originales: con ellos la app sigue comportándose exactamente igual que PSeInt.
**Ojo:** un programa que usa `Retornar` no corre en PSeInt de la computadora.

El cambio está en `core/retornar.patch` (unas 100 líneas sobre el código de PSeInt) y
sus pruebas en `tests/retornar/`.

## Cómo funciona

```
 PSeInt (C++)  ──core/patch_pseint.py──▶  wasi-sdk  ──▶  pseint.wasm
                 (cambios mínimos)                     (+ Asyncify)
                                                            │
 web/  ── index.html + js/ ── worker.js ── pseint-runtime.js ┘
          editor, consola      (segundo plano)  (WASI en JavaScript)
```

- **`core/`**: adapta y compila el intérprete. Para compilarlo hay dos cambios mínimos
  (sacar el depurador por red y la lectura de teclas de Linux); además se aplica
  `retornar.patch`, que agrega `Retornar`. Los perfiles propios están en `core/perfiles/`.
- **`web/js/pseint-runtime.js`**: le da al intérprete lo que espera de un sistema
  operativo (pantalla, teclado, archivos) dentro del navegador. Cuando el programa
  hace `Leer`, el intérprete se pausa con *Asyncify* hasta que el alumno escribe.
- **`web/js/worker.js`**: corre el intérprete en segundo plano; por eso un bucle
  infinito nunca congela la app y se puede cortar con **Detener**.
- **Capacitor** envuelve la misma web en un APK.

## Primeros pasos en GitHub

1. Creá un repositorio nuevo en GitHub (por ejemplo `pseint-movil`), vacío.
2. En tu laptop con Debian, dentro de esta carpeta:
   ```bash
   git init -b main
   git add .
   git commit -m "Primera versión de PSeInt Móvil"
   git remote add origin https://github.com/TU_USUARIO/pseint-movil.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Andá a la pestaña **Actions**: vas a ver "Compilar PSeInt Móvil" corriendo
   (tarda unos 5 minutos). Hace tres cosas:
   - compila el intérprete y corre las **180 pruebas oficiales** de PSeInt más las
     propias de la app (`tests/`);
   - publica la app web en `https://TU_USUARIO.github.io/pseint-movil/`;
   - genera el **APK** (lo bajás desde el resumen de la ejecución, en *Artifacts*).

Cada vez que hagas `git push`, se vuelve a compilar todo solo.

### Instalar en el celular

- **Como app web** (lo más fácil para los chicos): abrir el link de GitHub Pages en
  Chrome → menú ⋮ → **Agregar a la pantalla principal**. Se actualiza sola.
- **Como APK**: descomprimir el artifact, pasar `pseint-movil.apk` al celular y
  abrirlo (Android pide permitir instalar apps de esa fuente).

### Firmar el APK (importante antes de repartirlo)

Sin firma propia, cada compilación genera un APK con una firma distinta y Android
no deja actualizar: hay que desinstalar (y se pierden los programas guardados).
Para evitarlo, creá **una sola vez** tu clave en la laptop:

```bash
keytool -genkeypair -v -keystore pseint-movil.jks -alias pseint \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 pseint-movil.jks > clave.txt
```

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Nombre | Valor |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | el contenido de `clave.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | la contraseña del keystore |
| `ANDROID_KEY_ALIAS` | `pseint` |
| `ANDROID_KEY_PASSWORD` | la contraseña de la clave |

Guardá `pseint-movil.jks` en un lugar seguro y **no lo subas al repositorio**
(ya está en `.gitignore`). Si lo perdés, no vas a poder publicar actualizaciones.

### Publicar una versión

```bash
git tag v0.1.0
git push origin v0.1.0
```

Eso crea una *Release* en GitHub con el APK adjunto, con un link fijo para compartir.

### Usar la última versión de PSeInt

Por defecto se compila PSeInt 20210609 desde una copia en GitHub, que es la versión
probada. Para probar la última versión oficial: **Actions → Compilar PSeInt Móvil →
Run workflow → fuente: sourceforge**. Si el código cambió y los arreglos de
`core/patch_pseint.py` ya no encajan, el paso de compilación lo avisa con claridad.

## Trabajar en la laptop (opcional)

```bash
# 1. Herramientas
npm install
curl -LO https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sdk-25.0-x86_64-linux.tar.gz
tar xzf wasi-sdk-25.0-x86_64-linux.tar.gz
git clone https://github.com/miguelinux/pseint.git pseint-src

# 2. Compilar y probar
PSEINT_SRC=pseint-src WASI_SDK=$PWD/wasi-sdk-25.0-x86_64-linux npm run build:wasm
PSEINT_SRC=pseint-src npm test

# 3. Abrir en el navegador: http://localhost:8080
npm run serve
```

Para abrirlo en Android Studio: `npm run android:add` y después `npx cap open android`.

## Qué falta

- Ejecución paso a paso y prueba de escritorio.
- Exportar a otros lenguajes (C, Java, Python…): el exportador de PSeInt
  (`psexport`) también es C++ y se podría compilar igual.
- El diagrama de flujo quedó afuera a propósito.

## Licencia

GPL v2, igual que PSeInt (ver `LICENSE`). La tipografía Inconsolata (licencia OFL)
y los perfiles y ejemplos vienen del código original de PSeInt.
