# NativeGameLink for Steam

[English](README.md) · **Español**

**Lleva la experiencia completa de la Biblioteca de Steam a tus juegos que no son de Steam.**

NativeGameLink for Steam es un complemento para [Millennium](https://steambrew.app/) que vincula un acceso directo externo con su AppID real de Steam y reconstruye su página de Biblioteca con metadatos oficiales, ilustraciones, actividad, logros, comunidad, tiempo de juego y controles de estilo nativo.

Una vez vinculado, el juego deja de sentirse como un acceso directo vacío: recibe la identidad y presentación de su versión de Steam sin dejar de ejecutar el archivo que añadiste originalmente.

> NativeGameLink modifica la presentación local de los accesos directos vinculados. No concede licencias, propiedad de juegos, objetos de inventario, almacenamiento de Steam Cloud ni logros oficiales para el perfil de Steam.

---

## ✨ Novedades de la v3.0.0 y Funciones principales

- **Compatibilidad con Juegos Eliminados y Deslistados de Steam:** Soporte completo para títulos descatalogados o sin página de tienda activa en Steam (como *Mortal Kombat Komplete Edition*, *Transformers: Devastation*, etc.), resolviendo metadatos e ilustraciones oficiales sin bloqueos.
- **Gestión y Cambio de Artworks Directamente desde Propiedades:** Selector visual dentro de la pestaña *Personalización* en Propiedades para previsualizar, cambiar y aplicar fondos hero, logos, cápsulas e iconos en tiempo real.
- **Modificación y Gestión de Logros en Juegos Originales de Steam (SAM Integrado):** Consulta, desbloquea, bloquea o edita el progreso de logros de tus juegos oficiales de Steam directamente desde la biblioteca.
- **Simulación y Farmeo de Cromos de Steam (Trading Cards):** Colección interactiva de tarjetas en 3D, seguimiento de cromos restantes, progreso de insignia y acceso directo a la comunidad.
- **Simulador de Logros Simplificado para Juegos No-Steam:** Configuración ultra accesible por juego (100% completado, progreso simulado o manual), compatible con emuladores y lanzadores externos.
- **Detección Automática Inteligente:** Evalúa evidencias reales de ejecutables, rutas de instalación y niveles de confianza con previsualización de carátulas.
- **Integración con Big Picture & Steam Deck UI:** Renderizado oficial de fondos hero, logos y tiempo de juego sincronizado de forma nativa.

---

## 🎮 Una experiencia de Biblioteca de estilo nativo

NativeGameLink reconstruye las superficies que normalmente faltan en un acceso directo externo:

- **Barra superior estilo Steam** con Jugar, presentación del estado de Cloud, última sesión, tiempo total, progreso de logros, información del juego, mando y favoritos.
- **Enlaces oficiales** a la tienda, DLC, punto de encuentro, tienda de puntos, discusiones, guías, Workshop y soporte cuando existen.
- **Panel de información** con portada, descripción, desarrollador, editor, franquicia, fecha de lanzamiento, modos de juego, compatibilidad con mandos, préstamo familiar, capacidad de Steam Cloud y otras características de la tienda.
- **Feed de actividad y noticias** que combina eventos de socios, anuncios, actualizaciones importantes, parches, hotfixes, ofertas, eventos y lanzamientos de DLC en orden cronológico.
- **Editor de estados** con emoticonos e historial de actividad independiente para cada acceso directo.
- **Amigos que juegan** con perfiles, avatares, tiempo reciente, reseñas, capturas, vídeos y actividad cuando Steam permite obtenerla.
- **Contenido de la comunidad** con capturas, ilustraciones y guías que aparecen progresivamente para acelerar la carga inicial.
- **Panel y ventana de logros** con grupos desbloqueados y bloqueados, progreso, descripciones, fechas, porcentajes globales e iconos nativos.
- **Presentación de cromos/tarjetas** con recursos oficiales de Steam Community y el Mercado, insignia, colección, expansión 3D centrada, iluminación por cursor y reflejo foil cuando los metadatos lo permiten.
- **Secciones opcionales de DLC y Workshop** validadas contra el AppID vinculado.
- **Las notas y áreas multimedia de Steam permanecen disponibles** junto al contenido añadido.

Los datos esenciales pueden aparecer inmediatamente desde la caché mientras noticias, amigos, logros y comunidad cargan de forma independiente. Un fallo temporal de red, Store o IPC no queda guardado indefinidamente hasta reiniciar Steam.

---

## 📸 Capturas

Estas capturas muestran la diferencia visual entre un acceso directo sin vincular y un juego vinculado, además de los logros/feed y la integración con Big Picture.

<p align="center">
  <img src="docs/screenshots/library-tlou-before.png" alt="The Last of Us Part I antes de vincular: Biblioteca no-Steam vacía" width="49%">
  <img src="docs/screenshots/library-tlou-after.png" alt="The Last of Us Part I después de vincular: ilustraciones, actividad y logros de Steam" width="49%">
</p>
<p align="center"><em>The Last of Us Part I · Antes de vincular · Después de vincular</em></p>

<p align="center">
  <img src="docs/screenshots/library-gow-before.png" alt="God of War Ragnarök antes de vincular: Biblioteca no-Steam vacía" width="49%">
  <img src="docs/screenshots/library-gow-after.png" alt="God of War Ragnarök después de vincular: ilustraciones, actividad y logros de Steam" width="49%">
</p>
<p align="center"><em>God of War Ragnarök · Antes de vincular · Después de vincular</em></p>

<p align="center">
  <img src="docs/screenshots/big-picture-library.png" alt="Cuadrícula de juegos instalados en Big Picture" width="49%">
  <img src="docs/screenshots/big-picture-recent.png" alt="Juegos recientes de Big Picture con tiempo de juego vinculado" width="49%">
</p>
<p align="center"><em>Biblioteca de Big Picture · Juegos recientes y tiempo de juego</em></p>

---

## 🔍 Detección automática y vinculación inteligente

Al abrir un acceso directo externo recién añadido, NativeGameLink puede sugerir automáticamente la versión de Steam más probable.

El detector combina distintas evidencias en lugar de confiar únicamente en el nombre:

- Nombre y ruta completa del ejecutable.
- Carpetas superiores e identidad de la instalación.
- `steam_appid.txt`, argumentos de lanzamiento, manifiestos y otras evidencias directas.
- Ejecutables oficiales conocidos y alias verificados.
- Objetivos de Unreal Engine como `Win64-Shipping.exe`.
- Launchers genéricos y procesos bootstrap, tratados con menor confianza.
- Candidatos de la tienda y diferencias entre ediciones, exigiendo una separación mínima entre resultados ambiguos.

La ventana de confirmación muestra nombres, AppID, confianza y carátulas antes de realizar cambios. Puedes elegir otro candidato, rechazar la sugerencia o introducir manualmente un AppID desde **Propiedades**.

Después de confirmar, NativeGameLink:

1. Guarda una asociación estable para el acceso directo.
2. Lo renombra con el título oficial.
3. Aplica el icono y las ilustraciones de Biblioteca.
4. Conserva el destino de lanzamiento original.
5. Puede sustituir un launcher que se cierra rápidamente por el ejecutable real del juego para mantener el seguimiento de tiempo.
6. Termina la identidad y los recursos en segundo plano aunque cierres la ventana de Propiedades.

---

## 🖼️ Ilustraciones automáticas y colocación nativa

NativeGameLink da prioridad a los recursos publicados por Steam y los coloca en sus espacios y proporciones esperados:

- **Portada vertical** (`600 × 900`) para colecciones y estanterías.
- **Fondo hero** (`1920 × 620`) para la cabecera de detalles.
- **Logo transparente**, usando también la posición oficial publicada por Steam.
- **Cápsula horizontal** (`920 × 430`) para juegos recientes y carruseles.
- **Icono oficial** obtenido desde las fuentes modernas o heredadas de Steam.

Al terminar, el proceso informa si todos los recursos fueron aplicados y cuáles faltan. Los recursos oficiales de Steam nunca se sustituyen automáticamente por recursos comunitarios.

### Respaldo con SteamGridDB

Si Steam no publicó una portada, fondo, logo o cápsula concreta, NativeGameLink puede pedir únicamente ese recurso faltante a [SteamGridDB](https://www.steamgriddb.com/). La selección prioriza AppID, tipo, dimensiones, transparencia, idioma y estilo apropiados, y rechaza dominios no autorizados.

Introduce tu propia API key de SteamGridDB en los ajustes de NativeGameLink y activa el respaldo automático. La clave se guarda solo en el contexto local de Steam/Millennium; no viene incluida con el complemento ni se envía a servidores de NativeGameLink. Otro código inyectado en el mismo contexto podría acceder al almacenamiento local, por lo que nunca debes publicar una clave compartida.

Para juegos cuya ficha haya sido retirada, abre **Propiedades** del acceso
directo y usa **Artwork de la biblioteca → Elegir artwork** para previsualizar
y escoger carátula vertical, fondo hero, logo y cápsula horizontal. La elección
queda guardada únicamente para ese acceso directo y se mantiene en futuras
sincronizaciones.

---

## 🖥️ Integración con Big Picture

NativeGameLink adapta localmente el modelo de datos de Big Picture para que los accesos vinculados se presenten como entradas normales de la Biblioteca:

- Ya no quedan separados dentro de **Fuera de Steam**, **No de Steam**, **Non-Steam** o su equivalente localizado.
- La categoría redundante se oculta cuando queda vacía.
- El estado de instalación, la presentación de mando, campos de compatibilidad y tiempo de juego se exponen a la interfaz de Big Picture.
- El comportamiento se limita a accesos vinculados y se restaura al desmontar el complemento o abandonar la integración.

Es una integración visual local: no convierte el acceso en una licencia adquirida ni evita las comprobaciones de propiedad de Steam.

---

## 🏆 Logros locales y notificaciones

NativeGameLink combina los metadatos e iconos de logros de Steam con un archivo local `achievements.json`. Cuando el archivo cambia mientras juegas, actualiza la Biblioteca y puede mostrar una notificación de desbloqueo estilo Steam con sonido.

Incluye:

- Contadores desbloqueados/totales en la barra y el panel lateral.
- Barras de progreso, grupos bloqueados y desbloqueados, iconos, descripciones y fechas.
- Ventana completa de logros con filtros de estilo nativo y porcentajes globales cuando están disponibles.
- Supervisión en vivo del archivo de progreso.
- Toast y sonido al desbloquear.
- Botón de prueba de notificaciones en los ajustes.
- Logros de prueba deterministas opcionales para revisar la interfaz sin un archivo local; desactivados por defecto.

### Configurar el archivo de logros

NativeGameLink solo lee el archivo y no lo modifica. La estructura predeterminada de GSE Saves es:

```text
%APPDATA%\GSE Saves\<AppID>\achievements.json
```

Puedes configurar la fuente de tres formas:

1. **Carpeta global:** En los ajustes de NativeGameLink, elige una carpeta base con una subcarpeta por AppID.
2. **Ruta por juego:** Abre el acceso directo → **Propiedades** → **Juego vinculado** y selecciona el archivo `achievements.json` o una carpeta que lo contenga.
3. **Búsqueda automática:** Deja la ruta individual en automático para buscar el AppID en GSE Saves, ubicaciones compatibles de Goldberg y las carpetas globales configuradas.

### Usar SteamAutoCrack / Goldberg

Los juegos que no generan un archivo local compatible necesitan un emulador o generador externo. NativeGameLink incluye orientación para [SteamAutoCrack](https://github.com/SteamAutoCracks/Steam-auto-crack/releases), que puede configurar Goldberg Emulator y crear las carpetas de AppID y el archivo `achievements.json` a medida que consigues logros.

Configuración habitual:

1. Configura el juego con SteamAutoCrack/Goldberg siguiendo la documentación de ese proyecto.
2. Comprueba que genere `achievements.json` en una carpeta asociada con el AppID correcto.
3. Apunta la carpeta global o la ruta individual de NativeGameLink a esa ubicación.
4. Inicia el juego mediante el acceso directo vinculado de Steam.
5. Usa **Probar notificación de logro** para comprobar el toast y el sonido por separado.

SteamAutoCrack y Goldberg Emulator son proyectos externos; no vienen incluidos ni son mantenidos por NativeGameLink. Úsalos únicamente con software que tengas permiso legal para configurar. Los desbloqueos locales se muestran en NativeGameLink, pero no desbloquean logros oficiales del perfil de Steam.

---

## ⏱️ Tiempo de juego y sesiones

### ¿Steam Beta o el seguimiento de NativeGameLink?

Las versiones de Steam Beta que incluyen medición nativa para juegos externos son la opción recomendada si quieres que el propio cliente mida y muestre el tiempo local del acceso directo. Puedes activarla desde **Steam → Parámetros → Interfaz → Participación en la beta del cliente → Steam Beta Update**.

NativeGameLink comprueba si el cliente actual ya expone tiempo de juego nativo para cada acceso vinculado. Cuando existe, utiliza el valor de Steam y no crea un contador duplicado. Cuando no existe, NativeGameLink activa automáticamente su propio seguimiento local alternativo. Este fallback viene activado por defecto y puede deshabilitarse desde los ajustes del complemento.

El seguimiento alternativo puede:

- Detectar cuándo comienza y termina un juego vinculado.
- Conservar sesiones tras cambios de título o regeneraciones del ID del acceso directo.
- Mostrar tiempo total en la Biblioteca de escritorio y Big Picture.
- Mantener sincronizados los alias con una identidad canónica.
- Recuperarse de sesiones interrumpidas o superpuestas.

### ⚠️ Requisito fundamental: Ejecutable principal vs. Launchers

> [!IMPORTANT]
> **Apunta directamente al `.exe` original del juego:**
> Para que el registro y la detección del tiempo de juego funcionen correctamente (tanto mediante la medición nativa de Steam como con el seguimiento alternativo de NativeGameLink), el acceso directo en Steam debe apuntar al **ejecutable principal/original del juego** —es decir, al archivo ejecutable que permanece abierto y en memoria durante toda la partida—.
> 
> **¿Por qué no funciona con launchers o ejecutables intermediarios?**
> Si agregas a Steam un launcher externo, script, instalador o ejecutable intermediario/wrapper que únicamente se encarga de abrir el juego real y luego se cierra de inmediato, Steam y el monitor de procesos detectarán que la aplicación ha finalizado en cuestión de segundos, deteniendo el contador y provocando que el tiempo jugado no se registre.
> 
> Si el juego incluye un launcher de este tipo, localiza en su carpeta de instalación el ejecutable real de larga duración (por ejemplo, en juegos de Unreal Engine suele estar en `Binaries/Win64/...-Shipping.exe`) y configúralo como destino en las propiedades del acceso directo en Steam. Durante el flujo de vinculación, NativeGameLink también intentará detectar y sugerirte dicho ejecutable real de forma automática.

---

## 🎴 Cromos, insignias, DLC y Workshop

Cuando la versión de Steam ofrece los datos necesarios, NativeGameLink añade secciones laterales de estilo nativo:

- Ilustraciones oficiales de cromos obtenidas desde Steam Community y el Mercado.
- Insignia, experiencia, cantidades obtenidas/restantes y cuadrícula adaptable.
- Expansión interactiva con inclinación 3D, brillo direccional, glow del cursor y reflejo holográfico exclusivo para foil.
- Portadas de DLC validadas y enlaces a la tienda.
- Vista previa y acceso a Workshop cuando el título lo admite.

Estas secciones reproducen la presentación de la Biblioteca. NativeGameLink no entrega cromos, insignias, EXP, propiedad de DLC ni objetos de inventario.

---

## 🌐 Interfaz multilenguaje

NativeGameLink detecta automáticamente el idioma activo del cliente Steam y traduce la interfaz inyectada para que coincida con él. Los encabezados de Biblioteca, enlaces de navegación, logros, etiquetas del feed, secciones de comunidad, información del juego, tooltips y controles nativos reutilizan las traducciones oficiales de Steam siempre que están disponibles.

Las ventanas propias del complemento, mensajes de detección, ajustes y resultados de vinculación utilizan el catálogo de localización de NativeGameLink. El español está incluido directamente y el inglés actúa como fallback seguro para los textos que Steam no traduzca. Al cambiar el idioma del cliente, los datos y la interfaz localizados se actualizan sin necesitar una edición separada del complemento.

---

## 📥 Instalación

1. Instala [Millennium](https://steambrew.app/) para Steam.
2. Descarga la versión más reciente de NativeGameLink for Steam.
3. Coloca la carpeta del complemento en:

   ```text
   <Steam>\millennium\plugins\NativeGameLinkForSteam
   ```

4. Reinicia Steam.
5. Activa **NativeGameLink for Steam** en la sección de complementos de Millennium.

---

## 🚀 Inicio rápido

1. En Steam, selecciona **Juegos → Añadir un producto que no es de Steam a mi biblioteca...** y agrega el **ejecutable principal** del juego (evita seleccionar launchers o ejecutables intermediarios para que el tiempo de juego se registre correctamente).
2. Abre el nuevo acceso directo en tu Biblioteca.
3. Revisa la detección automática y pulsa **Vincular juego**.
4. Espera el informe que confirma el nombre, icono y recursos aplicados.
5. La página vinculada cargará la información disponible y sus secciones opcionales.

Si la detección es incierta o no aparece:

1. Haz clic derecho sobre el acceso y abre **Propiedades**.
2. En **Juego vinculado**, revisa los candidatos visuales o pega un AppID/enlace de la tienda.
3. Selecciona la versión correcta y pulsa **Guardar**.

---

## 🛠️ Compilación desde el código fuente

El repositorio incluye el bundle de producción en `.millennium/Dist/index.js`.

```bash
# Instalar dependencias
npm install

# Comprobar TypeScript, arquitectura, localización, detección y Lua
npm run check

# Generar el bundle de producción
npm run build

# Ejecutar todas las comprobaciones y validar el bundle
npm run verify
```

Los cambios dentro de `backend/` se aplican después de reiniciar Steam.

---

## ☕ Apoya el proyecto

Si NativeGameLink for Steam ha mejorado tu Biblioteca, puedes apoyar su desarrollo, pruebas, traducción y mantenimiento en [Ko-fi](https://ko-fi.com/senkumil). Cada contribución ayuda a que el proyecto siga avanzando.

---

## 📄 Licencia

Licencia MIT — consulta [LICENSE](LICENSE) para más información.
