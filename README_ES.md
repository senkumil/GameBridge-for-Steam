# GameBridge for Steam

[English](README.md) · **Español**

**Lleva la experiencia completa de la Biblioteca de Steam a tus juegos que no son de Steam.**

GameBridge for Steam es un complemento para [Millennium](https://steambrew.app/) que vincula un acceso directo externo con su AppID real de Steam y reconstruye su página de Biblioteca con metadatos oficiales, ilustraciones, actividad, logros, comunidad, tiempo de juego y controles de estilo nativo.

Una vez vinculado, el juego deja de sentirse como un acceso directo vacío: recibe la identidad y presentación de su versión de Steam sin dejar de ejecutar el archivo que añadiste originalmente.

> GameBridge modifica la presentación local de los accesos directos vinculados. No concede licencias, propiedad de juegos, objetos de inventario, almacenamiento de Steam Cloud ni logros oficiales para el perfil de Steam.

---

## ✨ Funciones principales

- Detección automática con candidatos revisables, porcentajes de confianza y carátulas.
- Aplicación automática del título, icono, portada, fondo hero, logo transparente, posición del logo y cápsula horizontal oficiales.
- Página de Biblioteca de estilo nativo con actividad, noticias, logros, información, comunidad, amigos, tarjetas, DLC, Workshop, notas y enlaces.
- Integración con Big Picture que presenta los accesos vinculados como juegos nativos y elimina la categoría redundante **Fuera de Steam**.
- Progreso de logros locales con notificaciones de desbloqueo e integración opcional con SteamAutoCrack/Goldberg.
- Tiempo de juego registrado por Steam cuando está disponible y seguimiento alternativo persistente cuando no lo está.
- SteamGridDB como respaldo individual para recursos que Steam no haya publicado.
- Interfaz localizada según el idioma activo del cliente Steam, con fallback seguro en inglés.
- Aislamiento estricto: solo se modifican accesos directos vinculados; los juegos nativos permanecen fuera de la inyección.

---

## 🎮 Una experiencia de Biblioteca de estilo nativo

GameBridge reconstruye las superficies que normalmente faltan en un acceso directo externo:

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

## 🔍 Detección automática y vinculación inteligente

Al abrir un acceso directo externo recién añadido, GameBridge puede sugerir automáticamente la versión de Steam más probable.

El detector combina distintas evidencias en lugar de confiar únicamente en el nombre:

- Nombre y ruta completa del ejecutable.
- Carpetas superiores e identidad de la instalación.
- `steam_appid.txt`, argumentos de lanzamiento, manifiestos y otras evidencias directas.
- Ejecutables oficiales conocidos y alias verificados.
- Objetivos de Unreal Engine como `Win64-Shipping.exe`.
- Launchers genéricos y procesos bootstrap, tratados con menor confianza.
- Candidatos de la tienda y diferencias entre ediciones, exigiendo una separación mínima entre resultados ambiguos.

La ventana de confirmación muestra nombres, AppID, confianza y carátulas antes de realizar cambios. Puedes elegir otro candidato, rechazar la sugerencia o introducir manualmente un AppID desde **Propiedades**.

Después de confirmar, GameBridge:

1. Guarda una asociación estable para el acceso directo.
2. Lo renombra con el título oficial.
3. Aplica el icono y las ilustraciones de Biblioteca.
4. Conserva el destino de lanzamiento original.
5. Puede sustituir un launcher que se cierra rápidamente por el ejecutable real del juego para mantener el seguimiento de tiempo.
6. Termina la identidad y los recursos en segundo plano aunque cierres la ventana de Propiedades.

---

## 🖼️ Ilustraciones automáticas y colocación nativa

GameBridge da prioridad a los recursos publicados por Steam y los coloca en sus espacios y proporciones esperados:

- **Portada vertical** (`600 × 900`) para colecciones y estanterías.
- **Fondo hero** (`1920 × 620`) para la cabecera de detalles.
- **Logo transparente**, usando también la posición oficial publicada por Steam.
- **Cápsula horizontal** (`920 × 430`) para juegos recientes y carruseles.
- **Icono oficial** obtenido desde las fuentes modernas o heredadas de Steam.

Al terminar, el proceso informa si todos los recursos fueron aplicados y cuáles faltan. Los recursos oficiales de Steam nunca se sustituyen automáticamente por recursos comunitarios.

### Respaldo con SteamGridDB

Si Steam no publicó una portada, fondo, logo o cápsula concreta, GameBridge puede pedir únicamente ese recurso faltante a [SteamGridDB](https://www.steamgriddb.com/). La selección prioriza AppID, tipo, dimensiones, transparencia, idioma y estilo apropiados, y rechaza dominios no autorizados.

Introduce tu propia API key de SteamGridDB en los ajustes de GameBridge y activa el respaldo automático. La clave se guarda solo en el contexto local de Steam/Millennium; no viene incluida con el complemento ni se envía a servidores de GameBridge. Otro código inyectado en el mismo contexto podría acceder al almacenamiento local, por lo que nunca debes publicar una clave compartida.

---

## 🖥️ Integración con Big Picture

GameBridge adapta localmente el modelo de datos de Big Picture para que los accesos vinculados se presenten como entradas normales de la Biblioteca:

- Ya no quedan separados dentro de **Fuera de Steam**, **No de Steam**, **Non-Steam** o su equivalente localizado.
- La categoría redundante se oculta cuando queda vacía.
- El estado de instalación, la presentación de mando, campos de compatibilidad y tiempo de juego se exponen a la interfaz de Big Picture.
- El comportamiento se limita a accesos vinculados y se restaura al desmontar el complemento o abandonar la integración.

Es una integración visual local: no convierte el acceso en una licencia adquirida ni evita las comprobaciones de propiedad de Steam.

---

## 🏆 Logros locales y notificaciones

GameBridge combina los metadatos e iconos de logros de Steam con un archivo local `achievements.json`. Cuando el archivo cambia mientras juegas, actualiza la Biblioteca y puede mostrar una notificación de desbloqueo estilo Steam con sonido.

Incluye:

- Contadores desbloqueados/totales en la barra y el panel lateral.
- Barras de progreso, grupos bloqueados y desbloqueados, iconos, descripciones y fechas.
- Ventana completa de logros con filtros de estilo nativo y porcentajes globales cuando están disponibles.
- Supervisión en vivo del archivo de progreso.
- Toast y sonido al desbloquear.
- Botón de prueba de notificaciones en los ajustes.
- Logros de prueba deterministas opcionales para revisar la interfaz sin un archivo local; desactivados por defecto.

### Configurar el archivo de logros

GameBridge solo lee el archivo y no lo modifica. La estructura predeterminada es:

```text
C:\Steam Auto\<AppID>\achievements.json
```

Puedes configurar la fuente de tres formas:

1. **Carpeta global:** En los ajustes de GameBridge, elige una carpeta base con una subcarpeta por AppID.
2. **Ruta por juego:** Abre el acceso directo → **Propiedades** → **Juego vinculado** y selecciona el archivo `achievements.json` o una carpeta que lo contenga.
3. **Búsqueda automática:** Deja la ruta individual en automático para buscar el AppID dentro de las carpetas globales configuradas.

### Usar SteamAutoCrack / Goldberg

Los juegos que no generan un archivo local compatible necesitan un emulador o generador externo. GameBridge incluye orientación para [SteamAutoCrack](https://github.com/SteamAutoCracks/Steam-auto-crack/releases), que puede configurar Goldberg Emulator y crear las carpetas de AppID y el archivo `achievements.json` a medida que consigues logros.

Configuración habitual:

1. Configura el juego con SteamAutoCrack/Goldberg siguiendo la documentación de ese proyecto.
2. Comprueba que genere `achievements.json` en una carpeta asociada con el AppID correcto.
3. Apunta la carpeta global o la ruta individual de GameBridge a esa ubicación.
4. Inicia el juego mediante el acceso directo vinculado de Steam.
5. Usa **Probar notificación de logro** para comprobar el toast y el sonido por separado.

SteamAutoCrack y Goldberg Emulator son proyectos externos; no vienen incluidos ni son mantenidos por GameBridge. Úsalos únicamente con software que tengas permiso legal para configurar. Los desbloqueos locales se muestran en GameBridge, pero no desbloquean logros oficiales del perfil de Steam.

---

## ⏱️ Tiempo de juego y sesiones

GameBridge utiliza primero el tiempo que Steam ya registra para el acceso directo. Si el cliente no lo expone, el seguimiento alternativo opcional puede:

- Detectar cuándo comienza y termina un juego vinculado.
- Conservar sesiones tras cambios de título o regeneraciones del ID del acceso directo.
- Mostrar tiempo total en la Biblioteca de escritorio y Big Picture.
- Mantener sincronizados los alias con una identidad canónica.
- Recuperarse de sesiones interrumpidas o superpuestas.

Si el juego usa un launcher que se cierra inmediatamente, la vinculación puede sugerir el ejecutable de larga duración para que el seguimiento no termine antes de tiempo.

---

## 🎴 Cromos, insignias, DLC y Workshop

Cuando la versión de Steam ofrece los datos necesarios, GameBridge añade secciones laterales de estilo nativo:

- Ilustraciones oficiales de cromos obtenidas desde Steam Community y el Mercado.
- Insignia, experiencia, cantidades obtenidas/restantes y cuadrícula adaptable.
- Expansión interactiva con inclinación 3D, brillo direccional, glow del cursor y reflejo holográfico exclusivo para foil.
- Portadas de DLC validadas y enlaces a la tienda.
- Vista previa y acceso a Workshop cuando el título lo admite.

Estas secciones reproducen la presentación de la Biblioteca. GameBridge no entrega cromos, insignias, EXP, propiedad de DLC ni objetos de inventario.

---

## 🌐 Localización, rendimiento y aislamiento

- Los textos pertenecientes a Steam usan los tokens del idioma activo siempre que están disponibles.
- Los textos propios incluyen traducción española y fallback seguro en inglés para otros idiomas.
- Las cachés con reintentos descartan fallos temporales en vez de conservar resultados vacíos hasta reiniciar.
- Los datos esenciales cargan desde caché mientras feed, amigos, logros y comunidad se hidratan en paralelo.
- La navegación usa identificadores de generación para impedir que tareas antiguas modifiquen el siguiente juego.
- Los estilos nativos tocados durante la inyección se restauran al cambiar de página.
- La inyección exige la identidad estable del acceso vinculado; los accesos no vinculados y juegos nativos quedan fuera de su alcance previsto.

---

## 📥 Instalación

1. Instala [Millennium](https://steambrew.app/) para Steam.
2. Descarga la versión más reciente de GameBridge for Steam.
3. Coloca la carpeta del complemento en:

   ```text
   <Steam>\millennium\plugins\GameBridge for Steam
   ```

4. Reinicia Steam.
5. Activa **GameBridge for Steam** en la sección de complementos de Millennium.

---

## 🚀 Inicio rápido

1. En Steam, selecciona **Juegos → Añadir un producto que no es de Steam a mi biblioteca...** y agrega el ejecutable.
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

Si GameBridge for Steam ha mejorado tu Biblioteca, puedes apoyar su desarrollo, pruebas, traducción y mantenimiento en [Ko-fi](https://ko-fi.com/senkumil). Cada contribución ayuda a que el proyecto siga avanzando.

---

## 📄 Licencia

Licencia MIT — consulta [LICENSE](LICENSE) para más información.

Desarrollado por **David Miranda ([Davidjarod11](https://github.com/Davidjarod11))**.
