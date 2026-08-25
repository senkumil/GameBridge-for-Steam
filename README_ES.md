# GameBridge for Steam

Un potente complemento para [Millennium](https://steambrew.app/) diseñado para vincular accesos directos y juegos externos (no-Steam) con los metadatos oficiales de Steam, ofreciendo una experiencia visual completa, moderna y nativa tanto en la Biblioteca de escritorio como en Big Picture.

Vincula cualquier juego externo a un **AppID oficial o enlace de la tienda de Steam** para mostrar sus ilustraciones oficiales, noticias, actividad de amigos, contenido de la comunidad, logros y detalles del juego dentro de tu cliente de Steam.

---

## ✨ Características Principales

- **Ilustraciones Oficiales Automáticas**: Descarga e inyecta portadas oficiales desde el CDN de Steam (Banner Hero, Logo oficial, cuadrícula vertical y cápsula horizontal) con el tamaño y posicionamiento nativo publicado por Steam.
- **Detección Inteligente de AppID**: Reconoce ejecutables nuevos mediante evidencias locales (`steam_appid.txt`, manifiestos), carpetas, parámetros de lanzamiento y ejecutables de Unreal Engine (`*-Win64-Shipping.exe`).
- **Ficha de Detalles Nativa**: Muestra la descripción completa del juego, desarrollador, editor, fecha de lanzamiento y etiquetas de características en el idioma activo de tu cliente Steam.
- **Feed de Noticias y Actualizaciones**: Registro cronológico de parches, eventos oficiales, notas de actualización y anuncios de DLC en tu idioma.
- **Actividad Social y Amigos**: Visualiza qué amigos juegan o tienen el juego, sus logros recientes, capturas y publicaciones de estado directamente en el feed.
- **Integración de Logros**:
  - Progreso real y recuento de logros para juegos que posees.
  - Integración opcional de logros locales desde `C:\Steam Auto\<AppID>\achievements.json` con barra superior, panel lateral y ventana modal interactiva de logros estilo Steam.
- **Contenido de la Comunidad**: Capturas de pantalla populares, ilustraciones y guías de la comunidad de Steam con carga progresiva al desplazarse.
- **Secciones Opcionales**: Cromos simulados, enlaces a DLCs verificados y accesos a Steam Workshop cuando el AppID vinculado lo soporta.
- **Compatibilidad con Big Picture**: Registro de tiempo de juego, navegación compatible con mando y eliminación de categorías redundantes.
- **Alcance Seguro**: Los juegos nativos de Steam y los accesos sin vincular permanecen intactos.

---

## 📥 Instalación

1. Instala [Millennium](https://steambrew.app/) para Steam.
2. Descarga o clona este repositorio dentro de tu carpeta de complementos de Millennium:
   ```text
   <Steam>\millennium\plugins\GameBridge for Steam
   ```
3. Reinicia Steam.
4. Activa **GameBridge for Steam** en la configuración de complementos (**Steam → Parámetros → Millennium → Complementos**).

---

## 🎮 Modo de Uso

1. Añade tu juego externo a Steam de forma habitual (**Productos → Añadir un juego que no es de Steam a mi biblioteca...**).
2. Cuando el plugin detecte una coincidencia segura, revisa la ventana de confirmación y pulsa **Vincular juego**.
3. *Vinculación manual*: Si no se autodetecta o deseas cambiarlo, haz clic derecho sobre el acceso directo en tu Biblioteca → **Propiedades** → en la sección **Juego vinculado**, introduce el AppID o enlace de la tienda de Steam y pulsa **Guardar**.
4. Abre la página del juego en tu Biblioteca; los datos e ilustraciones se aplicarán automáticamente.

---

## 🏆 Configuración de Logros Locales (Opcional)

El plugin puede leer y representar el progreso de logros locales desde un archivo JSON (operación de solo lectura; no modifica servidores de Steam ni inventario).

- **Ruta predeterminada**:
  ```text
  C:\Steam Auto\<AppID>\achievements.json
  ```
- **Cambio de carpeta global**: Configura la ruta base desde los ajustes de **Millennium → Complementos → GameBridge for Steam** (guardado en `achievement_base_path.txt`).
- **Ruta personalizada por juego**: En **Propiedades → Juego vinculado → Archivo de progreso de logros** del acceso directo, puedes indicar una ruta `.json` o carpeta específica.

---

## 🛠️ Compilación desde el Código Fuente

El repositorio incluye el bundle listo para usar en `.millennium/Dist/index.js`. Si deseas modificar el código:

```bash
# Instalar dependencias
npm install

# Verificar arquitectura y tipos de TypeScript
npm run check

# Compilar paquete de producción
npm run build

# Ejecutar verificación completa
npm run verify
```

Los cambios en el backend (`backend/main.lua` y `backend/lib/`) se aplican al reiniciar Steam.

---

## 📄 Licencia

Licencia MIT — consulta el archivo [LICENSE](LICENSE) para más detalles.

Desarrollado por **David Miranda ([Davidjarod11](https://github.com/Davidjarod11))**.
