import { backendLog } from '../api/backend';
import { escapeRegex } from '../core/text';

let localizationDocumentProvider: (() => Document | null) | null = null;

export function setLocalizationDocumentProvider(provider: (() => Document | null) | null): void {
	localizationDocumentProvider = provider;
}

export function steamLocalizationManager(): any | null {
	try {
		const providedDocument = localizationDocumentProvider?.() || null;
		return (window as any).LocalizationManager
			|| (providedDocument?.defaultView as any)?.LocalizationManager
			|| (document?.defaultView as any)?.LocalizationManager
			|| null;
	} catch { return null; }
}

export const SPANISH_TOKEN_FALLBACKS: Record<string, string> = {
	AppDetails_Shortcut_Explanation: 'Alguna información sobre %1$s no está disponible porque no es un juego de Steam o es un mod. No obstante, Steam controla el inicio del juego por ti y, en la mayoría de los casos, la interfaz dentro del juego estará disponible.',
	AppDetails_SectionTitle_Activity: 'Actividad',
	AppActivity_StatusUpdate_Post: 'Diles algo sobre este juego a tus amigos...',
	AppActivity_PostStatusUpdate: 'Publicar',
	AppActivity_FetchMore: 'Cargar más actividad',
	AppDetails_SectionTitle_Community: 'Contenido de la comunidad',
	AppDetails_SectionTitle_Achievements: 'Logros',
	AppActivity_NoActivity: 'No hay actividad reciente de los desarrolladores de este título o de tus amigos.',
	AppActivity_ViewLatestNews: 'Ver las últimas novedades',
	AppDetails_Developer: 'Desarrollador',
	AppDetails_Publisher: 'Editor',
	AppDetails_Franchise: 'Franquicia',
	AppDetails_ReleaseDate: 'Fecha de publicación',
	AppDetails_GameInfo: 'Información del juego',
	GameAction_ViewDetails: 'Mostrar detalles del juego',
	GameAction_ViewDetails_Collapse: 'Ocultar detalles del juego',
	AppDetails_Feature_SinglePlayer: 'Un jugador',
	AppDetails_Feature_MultiPlayer: 'Multijugador',
	AppDetails_Feature_CoOp: 'Cooperativo',
	AppDetails_Feature_SteamCloud: 'Progreso guardado en la nube',
	AppDetails_Feature_FullController: 'Compatibilidad total con control',
	AppDetails_Feature_PartialController: 'Compatibilidad parcial con control',
	AppDetails_Feature_FamilySharing: 'Préstamo familiar',
	AppDetails_Feature_RemotePlayTogether: 'Remote Play Together',
	AppDetails_SectionTitle_TradingCards: 'Tarjetas',
	AppDetails_Links_Store: 'Página de la tienda',
	AppDetails_Links_DLC: 'DLC',
	AppDetails_Links_Community: 'Punto de encuentro',
	AppDetails_Links_PointsShop: 'Tienda de puntos',
	AppDetails_Link_Discussions: 'Discusiones',
	AppDetails_Link_Guides: 'Guías',
	AppDetails_Link_Workshop: 'Steam Workshop',
	AppDetails_Link_Support: 'Soporte',
	Button_Close: 'Cerrar',
	Button_Cancel: 'Cancelar',
	Button_Continue: 'Continuar',
	Search: 'Buscar',
	Button_Save: 'Guardar',
	AppActivity_Achieved: ' ha conseguido',
	AppActivity_PostedVideo: ' ha compartido un vídeo',
	AppActivity_PostedVideo_Plural: ' ha compartido %1$s vídeos',
	AppActivity_PostedScreenshot: ' ha compartido una captura de pantalla',
	AppActivity_PostedScreenshot_Plural: ' ha compartido %1$s capturas de pantalla',
	AppActivity_RecommendedGame: ' ha hecho una reseña de este juego',
	AppActivity_RecommendedGame_ReadMore: 'Leer más',
	AppActivity_ReceivedNewGameList: ' ha añadido %1$s a su biblioteca',
	AppActivity_AddedGameToWishlist: ' ha añadido %1$s a su %2$s',
	AppActivity_Wishlist: 'lista de deseados',
	AppActivity_PlayedGameFirstTime: ' ha jugado a %1$s por primera vez',
	AppActivity_UserStatus: ' ha publicado una actualización de estado',
};

export const SPANISH_TRANSLATIONS: Record<string, string> = {
	activity: 'Actividad',
	post_placeholder: 'Diles algo sobre este juego a tus amigos...',
	publish: 'Publicar',
	fetch_more: 'Cargar más actividad',
	activity_end: 'Fin de la actividad',
	community_content: 'Contenido de la comunidad',
	achievements_label: 'Logros',
	achievements_unlocked: '{unlocked} de {total} logros desbloqueados',
	achievements_mine: 'MIS LOGROS',
	achievements_global: 'LOGROS GLOBALES',
	hidden_achievement: 'Logro oculto',
	players_have_achievement: 'de los jugadores tienen este logro',
	unlocked_on: 'Desbloqueado el {date}',
	no_achievements: 'No se encontraron logros.',
	no_recent_activity: 'No hay actividad reciente de los desarrolladores de este título o de tus amigos.',
	latest_news: 'Ver las últimas novedades',
	developer: 'Desarrollador',
	publisher: 'Editor',
	franchise: 'Franquicia',
	release_date: 'Fecha de publicación',
	game_information: 'Información del juego',
	show_game_details: 'Mostrar detalles del juego',
	hide_game_details: 'Ocultar detalles del juego',
	single_player: 'Un jugador',
	multi_player: 'Multijugador',
	cooperative: 'Cooperativo',
	cloud_saves: 'Progreso guardado en la nube',
	full_controller: 'Compatibilidad total con control',
	partial_controller: 'Compatibilidad parcial con control',
	family_sharing: 'Préstamo familiar',
	trading_cards: 'Tarjetas',
	store_page: 'Página de la tienda',
	dlc_links: 'DLC',
	community_hub: 'Punto de encuentro',
	points_shop: 'Tienda de puntos',
	discussions: 'Discusiones',
	guides: 'Guías',
	workshop: 'Steam Workshop',
	support: 'Soporte',
	close: 'Cerrar',
	cancel: 'Cancelar',
	continue: 'Continuar',
	search: 'Buscar',
	save: 'Guardar',
	unlink: 'Desvincular',
	unlinking: 'Eliminando la vinculación y sus portadas guardadas...',
	unlink_success: 'Vinculación eliminada. Puedes volver a vincular este mismo acceso directo sin borrarlo de Steam.',
	unlink_failed: 'No se pudo eliminar la vinculación.',
	linked_title: 'Juego vinculado',
	linked_description: 'Pega un Steam AppID o enlace de la tienda de Steam para mostrar la información del juego en esta página de la biblioteca.',
	appid_placeholder: 'Steam AppID o enlace de la tienda de Steam',
	manual_appid_label: 'O introduce un Steam AppID manualmente',
	manual_appid_placeholder: 'Steam AppID',
	manual_appid_title: 'Steam AppID manual',
	manual_appid_ready: 'AppID manual seleccionado. Revisa el juego de Steam antes de vincularlo.',
	manual_appid_invalid: 'Introduce un Steam AppID numérico.',
	game_achievement_path_title: 'Archivo de progreso de logros',
	game_achievement_path_description: 'Opcional. Pega el archivo JSON de logros de este juego, o una carpeta que contenga achievements.json. Se comprueba antes que las carpetas globales de AppID.',
	game_achievement_path_placeholder: 'Ejemplo: D:\\Juego\\achievements.json',
	game_achievement_path_save: 'Guardar ruta',
	game_achievement_path_clear: 'Usar automático',
	skip_launcher: 'Intentar omitir el launcher',
	skip_launcher_help: 'Añade -nolauncher manteniendo tus opciones de lanzamiento actuales. Actívalo solo si este juego admite ese argumento.',
	game_achievement_path_loading: 'Cargando fuente de logros...',
	game_achievement_path_link_first: 'Primero vincula este acceso directo a un Steam AppID.',
	game_achievement_path_failed: 'No se pudo cargar la fuente de logros.',
	game_achievement_path_ready: 'Este juego usará el archivo de logros seleccionado.',
	game_achievement_path_saved_missing: 'La ruta está guardada, pero no se encontró ningún archivo achievements.json legible allí.',
	game_achievement_path_automatic: 'Usando carpetas automáticas de AppID de la configuración global del plugin.',
	game_achievement_path_enter: 'Introduce un archivo JSON o ruta de carpeta.',
	game_achievement_path_saved: 'Fuente de logros guardada para este juego.',
	game_achievement_path_cleared: 'Ruta personalizada eliminada; se usarán las carpetas automáticas de AppID.',
	game_achievement_options_title: 'Opciones de progreso de logros',
	game_zero_achievements_title: 'Ignorar progreso local y mostrar 0',
	game_zero_achievements_description: 'Ignora la ruta personalizada y las carpetas globales de AppID para este juego sin borrar sus archivos.',
	game_simulated_achievements_title: 'Logros simulados',
	game_simulated_achievements_description: 'Muestra progreso determinista usando los nombres e iconos reales de Steam.',
	game_simulated_unlock_all_title: 'Desbloquear todos los logros',
	game_simulated_unlock_all_description: 'Muestra el 100 % completado en lugar de progreso simulado parcial.',
	game_online_achievements_title: 'Desbloquear solo logros online',
	game_online_achievements_description: 'También desbloquea los logros identificados como online, multijugador o cooperativos.',
	game_replay_next_achievements_title: 'Repetir todos los logros en el próximo inicio',
	game_replay_next_achievements_description: 'Muestra una vez todos los logros desbloqueados hasta el momento y después se desactiva automáticamente.',
	game_replay_every_achievements_title: 'Mostrar todos los logros en cada inicio',
	game_replay_every_achievements_description: 'Repite todos los logros desbloqueados cada vez que se ejecuta este juego.',
	game_achievement_options_reset: 'Usar valores globales',
	game_achievement_options_local: 'Usando opciones guardadas para este juego.',
	game_achievement_options_global: 'Usando los valores globales del plugin.',
	game_achievement_path_simulation_blocked: 'Los logros simulados están activos; no se puede usar a la vez una ruta de progreso personalizada.',
	game_achievement_path_zero_blocked: 'El progreso local está desactivado para este juego; se mostrará la lista real de Steam al 0 %.',
	game_achievement_options_saving: 'Guardando opciones de logros...',
	game_achievement_options_failed: 'No se pudieron guardar las opciones de logros.',
	no_match_found: 'No se encontró una coincidencia confiable. Puedes introducir el AppID manualmente.',
	shortcut_suggestions_title: 'Sugerencias de Steam AppID:',
	no_suggestions_found: 'Sin sugerencias automáticas (introduce el AppID abajo)',
	current_linked_option: 'Juego vinculado actualmente (AppID {appid})',
	detecting_game: 'Detectando el juego automáticamente...',
	detected_game: 'Detectado: {name}. Revisa el resultado y pulsa Guardar para vincularlo.',
	detection_ready: 'La detección automática está lista para confirmar.',
	detection_uncertain: 'La coincidencia es incierta. Elige el resultado correcto o introduce el AppID manualmente.',
	use_tracking_executable: 'Usar el ejecutable real del juego',
	tracking_executable_help: '{bootstrap} se cierra después de iniciar {game}. Usa {game} para que Steam registre tus horas de juego.',
	locked_achievements: 'Logros bloqueados',
	view_all_achievements: 'Ver todos los logros',
	view_dlc_store: 'Ver DLC en la tienda',
	view_my_cards: 'Ver mis tarjetas',
	cards_found: 'Tarjetas encontradas',
	cards_remaining: '{count} tarjetas por coleccionar',
	experience_points: '100 de EXP',
	trading_cards_help_p1: 'Encuentra tarjetas mientras juegas. Puedes intercambiarlos con amigos (o en el mercado de la Comunidad de Steam) por tarjetas que no has podido encontrar.',
	trading_cards_help_p2: 'Completa todo el set de tarjetas y conviértelos en una insignia. Las insignias aumentan tu nivel de Steam y desbloquean beneficios en tu cuenta y perfil.',
	recent_emoticons: 'EMOTICONOS RECIENTES',
	all_emoticons: 'TODOS LOS EMOTICONOS',
	explore_workshop: 'Explora el contenido creado por la comunidad para este juego.',
	visit_workshop: 'Visitar este Workshop',
	trending_item: 'Artículo popular',
	settings_title: 'GameBridge for Steam',
	settings_guide_title: '¿Cómo vincular tus juegos a Steam?',
	settings_step_1: 'Añade tu juego en Steam (+ Añadir un producto → Añadir un producto que no es de Steam).',
	settings_step_2: 'Haz clic derecho en el juego en tu biblioteca de Steam → Propiedades.',
	settings_step_3: 'En el campo "Juego vinculado", pega el Steam AppID o URL de la tienda (ej: 1245620 para Elden Ring).',
	settings_step_4: '¡Listo! Tu juego cargará portadas oficiales, noticias, capturas, logros locales y compatibilidad con Big Picture.',
	achievement_path_title: 'Carpeta local de logros',
	achievement_path_description: 'Carpeta base con subcarpetas por AppID: <carpeta>\\<AppID>\\achievements.json.',
	achievement_path_placeholder: 'Ejemplo: %APPDATA%\\GSE Saves',
	achievement_path_loading: 'Cargando...',
	achievement_path_browse: 'Examinar...',
	achievement_path_browsing: 'Abriendo...',
	achievement_path_save: 'Guardar',
	achievement_path_reset: 'Predeterminado',
	achievement_path_saved: 'Carpeta de logros guardada.',
	achievement_path_saved_missing: 'La carpeta está guardada, pero todavía no existe.',
	achievement_path_failed: 'No se pudo guardar la carpeta de logros.',
	achievement_autocrack_title: 'Generación de logros en juegos externos',
	achievement_autocrack_note: 'Para que los juegos no oficiales registren logros en tiempo real, deben usar un emulador como SteamAutoCrack (Goldberg Emulator). El emulador generará automáticamente las carpetas y el archivo achievements.json a medida que juegas y consigues logros.',
	achievement_autocrack_download_link: 'Descargar SteamAutoCrack en GitHub (Releases)',
	achievement_test_title: 'Probar notificaciones de logros',
	achievement_test_description: 'Envía una notificación de logro aleatoria con sonido para probar que las notificaciones funcionan.',
	achievement_test_loading: 'Enviando notificación de prueba...',
	achievement_test_button: 'Probar notificación (con sonido)',
	achievement_test_sent: '✓ Notificación de prueba enviada: {game} — {achievement}',
	achievement_test_failed: 'No se pudo mostrar la notificación de prueba. Revisa el registro de Millennium.',
	auto_detect_title: 'Detección automática de accesos directos',
	auto_detect_description: 'Sugiere vincular cuando se añaden nuevos juegos que no son de Steam a tu biblioteca.',
	auto_detect_shortcuts_toggle: 'Sugerir vinculación solo después de añadir un juego desde la ventana nativa de Steam',
	auto_detect_suppressed_count: 'Sugerencias automáticas bloqueadas permanentemente: {count}.',
	auto_detect_suppressed_missing: 'El acceso directo ya no está presente en la biblioteca',
	auto_detect_reset_suppressed: 'Restablecer sugerencias automáticas rechazadas',
	auto_detect_native_add_description: 'Solo observa la sesión de la ventana “Añadir un juego que no es de Steam” de Steam. El inicio, la navegación, los cambios de idioma y la desvinculación nunca pueden activar este aviso. Si cierras o rechazas un aviso automático, queda bloqueado permanentemente para ese juego.',
	experimental_title: 'Experimental',
	experimental_badge: 'EXPERIMENTAL',
	experimental_description: 'Estas herramientas priorizan la seguridad: la vinculación masiva omite coincidencias ambiguas y la revisión automática solo puede ejecutarse después de cerrar la ventana nativa de Steam para añadir juegos externos.',
	bulk_link_experimental_title: 'Vinculación masiva rápida',
	bulk_link_experimental_description: 'Vincula en segundo plano las coincidencias de alta confianza sin abrir un modal por juego. Los casos ambiguos permanecen desvinculados para revisión manual.',
	bulk_link_running: 'Analizando y vinculando coincidencias de alta confianza...',
	bulk_link_progress: 'Vinculando {done}/{total}: {game}',
	bulk_link_analyzing_progress: 'Analizando {done}/{total}: {game}',
	bulk_link_analyzing_game: 'Analizando: {game}',
	bulk_link_linking_game: 'Vinculando: {game}',
	bulk_link_not_linked_title: 'No se pudieron vincular ({count})',
	bulk_link_retrying_games: 'Aún completándose en segundo plano ({count}): {games}',
	bulk_link_reason_ambiguous: 'No se encontró una coincidencia suficientemente confiable.',
	bulk_link_reason_context: 'No se pudo leer la información del acceso directo.',
	bulk_link_reason_detection: 'Falló la detección de candidatos.',
	bulk_link_reason_invalid_appid: 'El Steam AppID detectado no es válido.',
	bulk_link_reason_native: 'La entrada no fue reconocida como un acceso directo que no es de Steam.',
	bulk_link_reason_incomplete: 'La vinculación no pudo completar todos los recursos requeridos.',
	bulk_link_reason_failed: 'No se pudo completar la vinculación.',
	bulk_link_result: 'Vinculación masiva terminada: {linked} vinculados, {queued} en cola para reintento, {skipped} ambiguos omitidos, {failed} fallidos.',
	bulk_link_failed: 'No se pudo completar la vinculación masiva.',
	bulk_linking_short: 'Vinculando...',
	link_management_description: 'Vincula o desvincula juegos externos individualmente. La revisión automática, si está habilitada, queda aislada al flujo nativo de Steam para añadir juegos que no son de Steam.',
	link_management_title: 'Gestión de vinculaciones',
	manual_link_only_description: 'La vinculación es únicamente manual. GameBridge nunca abre una ventana de vinculación automáticamente.',
	link_management_summary: '{linked} de {total} juego(s) que no son de Steam están vinculados.',
	link_management_empty: 'No hay juegos que no sean de Steam disponibles actualmente.',
	link_all_button: 'Vincular todos',
	unlink_all_button: 'Desvincular todos',
	link_button: 'Vincular',
	game_linked_appid: 'Vinculado · Steam AppID {appid}',
	game_unlinked_status: 'Desvinculado',
	manual_link_review_started: 'Revisión de vinculación abierta para {game}.',
	manual_link_review_failed: 'No se pudo iniciar la revisión de vinculación para {game}.',
	bulk_link_started: 'Revisión manual de vinculación iniciada para {count} juego(s).',
	bulk_link_none: 'No hay juegos desvinculados para revisar.',
	bulk_unlinking: 'Desvinculando todos los juegos de GameBridge...',
	bulk_unlinking_short: 'Desvinculando...',
	bulk_unlink_success: 'Todos los juegos vinculados fueron desvinculados. Las ventanas automáticas seguirán bloqueadas hasta que vuelvas a vincular explícitamente.',
	bulk_unlink_partial: 'Algunos juegos no se pudieron desvincular ({failed} fallidos).',
	bulk_unlink_failed: 'No se pudieron desvincular todos los juegos.',
	settings_unlink_one_success: 'Desvinculado: {game}',
	settings_unlink_one_failed: 'No se pudo desvincular: {game}',
	playtime_tracking_title: 'Seguimiento de tiempo de juego (Fallback)',
	playtime_tracking_description: 'Registra y muestra las horas jugadas en juegos que no son de Steam si tu cliente de Steam no incluye seguimiento nativo.',
	playtime_tracking_toggle: 'Activar seguimiento y estadísticas de tiempo de juego para juegos externos',
	playtime_hours: '{count} h',
	playtime_minutes: '{count} min',
	playtime_less_than_minute: '< 1 min',
	playtime_section_title: 'TIEMPO DE JUEGO',
	last_played_section_title: 'ÚLTIMA VEZ JUGADO',
	last_played_today: 'Hoy',
	last_played_yesterday: 'Ayer',
	last_played_days_ago: 'Hace {count} días',
	simulated_achievements_title: 'Logros simulados',
	simulated_achievements_description: 'Valores globales para juegos vinculados. La configuración de cada juego puede sobrescribirlos.',
	simulate_achievements: 'Activar logros simulados cuando no exista un archivo local de progreso',
	simulate_unlock_all_toggle: 'Desbloquear todos los logros simulados',
	unlock_online_achievements_toggle: 'Desbloquear solo los logros identificados como online o multijugador',
	view_linked_achievements: 'Ver logros de este juego vinculado',
	emoticons: 'Emoticonos',
	auto_link_title: 'Juego de Steam detectado',
	auto_link_ready_to_review: 'Coincidencia lista para revisar',
	auto_link_step_link: '1 · Vincular',
	auto_link_step_identity: '2 · Identidad',
	auto_link_step_assets: '3 · Recursos',
	auto_link_executable_verified_review: 'El ejecutable coincide con este juego de Steam, pero el nombre del acceso directo es incierto. Revísalo antes de vincularlo.',
	link_queued_background: 'Vinculación en cola. Puedes cerrar esta ventana; la configuración continúa en segundo plano.',
	auto_link_message: 'Se encontró una coincidencia en Steam para “{name}”. Confírmala antes de que el plugin cargue la información del juego.',
	selected_executable: 'Ejecutable seleccionado: {exe}',
	executable_preserved: 'Steam seguirá iniciando el ejecutable que seleccionaste: {exe}',
	not_now: 'Rechazar',
	reject_link: 'Rechazar',
	link_game: 'Vincular juego',
	launcher_detected: 'Este destino parece un launcher. Opcionalmente puedes añadir -nolauncher.',
	tracking_repair_title: 'Reparar seguimiento de tiempo',
	tracking_repair_message: 'Este juego se inicia a través de un launcher secundario ({bootstrap}) que se cierra inmediatamente. Steam no podrá registrar tus horas de juego a menos que apuntes al ejecutable real ({game}).',
	repair_tracking: 'Reparar seguimiento',
	tracking_repair_success: '✓ El acceso directo ahora ejecuta el proceso principal del juego. Steam registrará tu tiempo de juego.',
	tracking_repair_failed: 'No se pudo actualizar el destino. Puedes seleccionar el ejecutable recomendado manualmente en Propiedades.',
	linked_updating: '✓ Vinculado a “{name}”. Actualizando nombre, icono y portadas...',
	link_incomplete_retrying: 'La vinculación todavía no está completa. GameBridge reintentará hasta que nombre, icono y portadas estén listos.',
	linked_official: '✓ Vinculado a “{name}”. Nombre e icono oficiales actualizados.',
	linked_name: '✓ Vinculado a “{name}”. Nombre oficial actualizado; el icono oficial no estaba disponible.',
	linked_reopen: '✓ Vinculado a “{name}”. Es posible que debas reiniciar Steam para ver el nuevo icono.',
	tracking_executable_updated: ' Steam ejecutará ahora el proceso principal del juego para registrar tu tiempo de juego.',
	local_note_updated: ' Nota local actualizada.',
	linked_open_save: '✓ Vinculado a “{name}”. Abre la página del juego y pulsa Guardar para actualizar su nombre e icono.',
	verifying_steam: 'Verificando en Steam...',
	achievement_unlocked_toast: 'Logro desbloqueado',
	community_guide: 'Guía de la comunidad',
	feed_game_launch: 'Inicio del juego',
	feed_game_update: 'Actualización del juego',
	feed_major_update: 'Actualización importante',
	feed_dlc: 'DLC',
	feed_offer: 'Oferta',
	feed_event: 'Evento',
	feed_news: 'Noticias',
	feed_beta: 'Beta',
	feed_content: 'Contenido',
	feed_free_trial: 'Prueba gratuita',
	feed_season: 'Temporada',
	feed_community: 'Comunidad',
	feed_patch_notes: 'Actualización menor / notas del parche',
	friend_generic_name: 'Un amigo',
	steam_user: 'Usuario de Steam',
	today: 'HOY',
	yesterday: 'AYER',
	status_posted_at: 'publicó una actualización de estado a las',
	delete_post: 'Eliminar publicación',
	recent_playtime_hours: '{count} horas jugadas recientemente',
	recent_playtime_minutes: '{count} minutos jugados recientemente',
	friends_recently_played: '{count} amigos jugaron recientemente',
	show_all_recently_played: 'Mostrar todos los jugados recientemente ({count} más)',
	friends_previously_played: '{count} amigos jugaron antes',
	friends_who_play: '{count} amigos juegan a este juego',
	show_all_previously_played: 'Mostrar todos los que jugaron antes ({count} más)',
	view_all_friends: 'Ver todos los amigos que juegan a este juego',
	enter_appid: 'Introduce un AppID o enlace de la tienda.',
	enter_numeric_appid: 'Introduce un AppID numérico o enlace de una página de la tienda.',
	done: 'Listo',
	more_links: 'Más enlaces',
	steamgriddb_artwork_title: 'Artwork comunitario (SteamGridDB)',
	steamgriddb_artwork_description: 'Sólo se consulta si Steam no publicó una portada, fondo, logo o cápsula. Nunca reemplaza artwork oficial.',
	steamgriddb_auto_artwork: 'Aplicar automáticamente recursos de SteamGridDB que falten',
	steamgriddb_api_key_placeholder: 'API key de SteamGridDB (se guarda sólo localmente)',
	steamgriddb_contributed: ' SteamGridDB aportó: {assets}.',
	link_complete_title: '✓ Vinculación completada.',
	link_complete_body: 'Nombre oficial, icono y las cuatro imágenes de biblioteca se aplicaron correctamente.',
	link_ready_library: 'El juego ya está listo en tu biblioteca.',
	link_warning_title: 'Vinculado con avisos.',
	link_warning_icon: 'No se pudo aplicar el icono oficial. ',
	link_warning_missing: ' Faltan: {assets}.',
	link_warning_fallback: 'Cuando Steam no publica una pieza de biblioteca, se conserva su arte oficial disponible como alternativa.',
	link_saved_review: 'La vinculación se guardó; revisa los recursos indicados.',
	appid_not_found: 'No se encontró el AppID {id} en Steam.',
	save_failed: 'No se pudo guardar.',
};

export function isSpanishLanguage(): boolean {
	const lang = String(steamLanguageSync() || '').toLowerCase();
	if (lang === 'spanish' || lang === 'latam') return true;
	try {
		const lm = steamLocalizationManager();
		const locales: string[] = lm?.m_rgLocalesToUse || [];
		for (const l of locales) {
			if (String(l).toLowerCase().startsWith('es')) return true;
		}
		if (lm?.m_strELanguage === 'spanish' || lm?.m_strELanguage === 'latam') return true;
	} catch {}
	try {
		const navLang = String(navigator.language || (navigator as any).userLanguage || '').toLowerCase();
		if (navLang.startsWith('es')) return true;
	} catch {}
	return false;
}

export function loc(token: string, fallbackEnglish: string): string {
	try {
		const lm = steamLocalizationManager();
		const cleanToken = String(token || '').replace(/^#/, '');
		const value = lm?.m_mapTokens?.get?.(cleanToken) ?? lm?.m_mapFallbackTokens?.get?.(cleanToken) ?? lm?.Localize?.(cleanToken);
		if (typeof value === 'string' && value.length > 0) return value;
	} catch {}
	if (isSpanishLanguage()) {
		const cleanToken = String(token || '').replace(/^#/, '');
		if (SPANISH_TOKEN_FALLBACKS[cleanToken]) return SPANISH_TOKEN_FALLBACKS[cleanToken];
	}
	return fallbackEnglish;
}

export const LOCALE_TO_STEAM_LANG: Record<string, string> = {
	en: 'english', de: 'german', fr: 'french', it: 'italian', ko: 'koreana',
	es: 'spanish', 'es-419': 'latam', 'es-mx': 'latam', 'es-ar': 'latam', 'es-cl': 'latam', 'es-co': 'latam', 'es-pe': 'latam',
	'zh-cn': 'schinese', 'zh-sg': 'schinese', 'zh-hans': 'schinese', 'zh-tw': 'tchinese', 'zh-hk': 'tchinese', 'zh-hant': 'tchinese',
	ru: 'russian', th: 'thai', ja: 'japanese', pt: 'portuguese', 'pt-br': 'brazilian',
	pl: 'polish', da: 'danish', nl: 'dutch', fi: 'finnish', no: 'norwegian', nb: 'norwegian', nn: 'norwegian',
	sv: 'swedish', hu: 'hungarian', cs: 'czech', ro: 'romanian', tr: 'turkish',
	ar: 'arabic', bg: 'bulgarian', el: 'greek', uk: 'ukrainian', vi: 'vietnamese',
	id: 'indonesian', ms: 'malay',
};

export const LANG_FINGERPRINT: Record<string, string> = {
	'الإنجازات': 'arabic', 'Conquistas': 'brazilian', 'Постижения': 'bulgarian',
	'Achievementy': 'czech', 'Præstationer': 'danish', 'Prestaties': 'dutch',
	'Achievements': 'english', 'Logros': 'spanish', 'Saavutukset': 'finnish', 'Succès': 'french',
	'Errungenschaften': 'german', 'Επιτεύγματα': 'greek', 'Teljesítmények': 'hungarian',
	'Achievement': 'italian', '実績': 'japanese', '도전 과제': 'koreana',
	'Prestasjoner': 'norwegian', 'Osiągnięcia': 'polish', 'Proezas': 'portuguese',
	'Realizări': 'romanian', 'Достижения': 'russian', 'Prestationer': 'swedish',
	'รางวัลความสำเร็จ': 'thai', 'Başarımlar': 'turkish', 'Досягнення': 'ukrainian',
	'Thành tựu': 'vietnamese',
};

export const LANG_TIEBREAK: Record<string, Record<string, string>> = {
	'Logros': { 'Amigos que juegan a este juego': 'spanish', 'Amigos que juegan': 'latam' },
	'成就': { '玩过的好友': 'schinese', '遊玩過的好友': 'tchinese' },
	'Pencapaian': { 'Teman yang bermain': 'indonesian', 'Rakan yang bermain': 'malay' },
};

export const STEAM_LANGUAGE_CACHE_KEY = 'gdl_steam_language_v1';

export let _steamLanguage: string | null = (() => {
	try {
		const cached = String(localStorage.getItem(STEAM_LANGUAGE_CACHE_KEY) || '').toLowerCase();
		return /^[a-z_]+$/.test(cached) ? cached : null;
	} catch { return null; }
})();

export function steamLanguageSync(): string | null {
	return _steamLanguage;
}

export type SteamLanguageListener = (language: string, previousLanguage: string | null) => void;

export const steamLanguageListeners = new Set<SteamLanguageListener>();

export let steamLanguageWatchTimer: ReturnType<typeof setInterval> | null = null;

export function subscribeSteamLanguageChange(listener: SteamLanguageListener): () => void {
	steamLanguageListeners.add(listener);
	return () => { steamLanguageListeners.delete(listener); };
}

export function commitSteamLanguage(language: string): string {
	const raw = String(language || '').toLowerCase().replace('_', '-');
	const base = raw.split('-')[0];
	const mapped = LOCALE_TO_STEAM_LANG[raw] || LOCALE_TO_STEAM_LANG[base] || raw.replace('-', '_');
	const next = /^[a-z_]+$/.test(mapped) ? mapped : 'english';
	const previous = _steamLanguage;
	_steamLanguage = next;
	try { localStorage.setItem(STEAM_LANGUAGE_CACHE_KEY, next); } catch {}
	if (previous !== next) {
		backendLog(`Steam language changed: ${previous || 'unknown'} -> ${next}`);
		for (const listener of Array.from(steamLanguageListeners)) {
			try { listener(next, previous); } catch (e) { backendLog('Steam language listener failed: ' + e); }
		}
	}
	return next;
}

export function startSteamLanguageWatcher(): void {
	if (steamLanguageWatchTimer) return;
	steamLanguageWatchTimer = setInterval(() => { void getSteamLanguage(true).catch(() => {}); }, 4000);
}

export function stopSteamLanguageWatcher(): void {
	if (!steamLanguageWatchTimer) return;
	clearInterval(steamLanguageWatchTimer);
	steamLanguageWatchTimer = null;
}

export async function getSteamLanguage(forceRefresh = false): Promise<string> {
	const cachedLanguage = _steamLanguage;
	if (_steamLanguage && !forceRefresh) return _steamLanguage;
	let lang = '';

	// 1. Ask the client directly
	try {
		const sc = (window as any).SteamClient;
		if (typeof sc?.Settings?.GetCurrentLanguage === 'function') {
			const l = await sc.Settings.GetCurrentLanguage();
			if (typeof l === 'string' && /^[a-z0-9_-]+$/i.test(l)) lang = l;
		}
	} catch {}

	// 2. Fingerprint the loaded localization tokens
	if (!lang) {
		const ach = loc('AppDetails_SectionTitle_Achievements', '');
		if (ach) {
			const tie = LANG_TIEBREAK[ach];
			if (tie) {
				lang = tie[loc('AppDetails_SectionTitle_Friends', '')] || Object.values(tie)[0];
			} else {
				lang = LANG_FINGERPRINT[ach] || '';
			}
		}
	}

	// 3. Browser locale mapping
	if (!lang) {
		try {
			const locales: string[] = (window as any).LocalizationManager?.m_rgLocalesToUse || [];
			for (const raw of locales) {
				const lc = String(raw).toLowerCase();
				if (LOCALE_TO_STEAM_LANG[lc]) { lang = LOCALE_TO_STEAM_LANG[lc]; break; }
				const base = lc.split('-')[0];
				if (LOCALE_TO_STEAM_LANG[base]) { lang = LOCALE_TO_STEAM_LANG[base]; break; }
			}
		} catch {}
	}

	if (lang) {
		const committed = commitSteamLanguage(lang);
		backendLog('Steam language detected: ' + committed);
		return committed;
	}
	return cachedLanguage || 'english';
}

export type SteamUiTokenSpec = { tokens?: string[]; params?: string[] };

export const GDL_STEAM_TOKEN_SPECS: Record<string, SteamUiTokenSpec> = {
	activity: { tokens: ['AppDetails_SectionTitle_Activity'] },
	post_placeholder: { tokens: ['AppActivity_StatusUpdate_Post'] },
	publish: { tokens: ['AppActivity_PostStatusUpdate'] },
	fetch_more: { tokens: ['AppActivity_FetchMore'] },
	community_content: { tokens: ['AppDetails_SectionTitle_Community'] },
	achievements_label: { tokens: ['AppDetails_SectionTitle_Achievements'] },
	achievements_unlocked: { tokens: ['AppDetails_PlayerUnlockedPercent'], params: ['unlocked', 'total'] },
	no_recent_activity: { tokens: ['AppActivity_NoActivity'] },
	latest_news: { tokens: ['AppActivity_ViewLatestNews'] },
	developer: { tokens: ['AppDetails_Developer'] },
	publisher: { tokens: ['AppDetails_Publisher'] },
	franchise: { tokens: ['AppDetails_Franchise'] },
	release_date: { tokens: ['AppDetails_ReleaseDate'] },
	game_information: { tokens: ['AppDetails_GameInfo'] },
	show_game_details: { tokens: ['GameAction_ViewDetails'] },
	hide_game_details: { tokens: ['GameAction_ViewDetails_Collapse'] },
	single_player: { tokens: ['AppDetails_Feature_SinglePlayer'] },
	multi_player: { tokens: ['AppDetails_Feature_MultiPlayer'] },
	cooperative: { tokens: ['AppDetails_Feature_CoOp'] },
	cloud_saves: { tokens: ['AppDetails_Feature_SteamCloud'] },
	full_controller: { tokens: ['AppDetails_Feature_FullController'] },
	partial_controller: { tokens: ['AppDetails_Feature_PartialController'] },
	family_sharing: { tokens: ['AppDetails_Feature_FamilySharing'] },
	trading_cards: { tokens: ['AppDetails_SectionTitle_TradingCards'] },
	feed_game_launch: { tokens: ['EventDisplay_EventType_10'] },
	feed_game_update: { tokens: ['AppActivity_EventType_GameUpdate'] },
	feed_major_update: { tokens: ['MajorUpdate_Type14'] },
	feed_dlc: { tokens: ['EventDisplay_EventType_15'] },
	feed_offer: { tokens: ['EventDisplay_EventType_20'] },
	feed_event: { tokens: ['EventDisplay_EventType_22'] },
	feed_news: { tokens: ['EventDisplay_EventType_28'] },
	feed_beta: { tokens: ['EventDisplay_EventType_29'] },
	feed_content: { tokens: ['EventDisplay_EventType_30'] },
	feed_free_trial: { tokens: ['EventDisplay_EventType_31'] },
	feed_season: { tokens: ['EventDisplay_EventType_32'] },
	feed_community: { tokens: ['EventDisplay_EventType_Other'] },
	locked_achievements: { tokens: ['AppDetails_LockedAchievements', 'Achievement_Filter_Locked'] },
	view_all_achievements: { tokens: ['AppDetails_Achievement_ViewAllAchievements', 'AppDetails_ViewAllAchievements', 'AppDetails_Achievements_ViewAll'] },
	view_dlc_store: { tokens: ['AppDetails_ViewDLCInStore', 'AppDetails_DLC_ViewInStore'] },
	view_my_cards: { tokens: ['AppDetails_TradingCards_ViewMyCards'] },
	store_page: { tokens: ['AppDetails_Links_Store', 'AppDetails_Link_Store', 'AppDetails_StorePage'] },
	dlc_links: { tokens: ['AppDetails_Links_DLC', 'AppDetails_SectionTitle_DLC', 'AppProperties_DLCPage'] },
	community_hub: { tokens: ['AppDetails_Links_Community', 'AppDetails_Link_GameHub', 'AppDetails_Links_CommunityHub'] },
	points_shop: { tokens: ['AppDetails_Links_PointsShop', 'Menu_PointsShop', 'PointsShop_Title'] },
	discussions: { tokens: ['AppDetails_Link_Discussions', 'Menu_Discussions', 'AppDetails_SectionTitle_Discussions'] },
	guides: { tokens: ['AppDetails_Link_Guides', 'AppOverlay_Guides', 'AppDetails_SectionTitle_Guides'] },
	workshop: { tokens: ['AppDetails_Link_Workshop', 'Menu_Workshop', 'AppDetails_SectionTitle_Workshop', 'AppDetails_Feature_SteamWorkshop'] },
	support: { tokens: ['AppDetails_Link_Support', 'SupportLink_Label', 'AppDetails_Soundtrack_Support'] },
	close: { tokens: ['Button_Close', 'Modal_Close'] },
	cancel: { tokens: ['Button_Cancel'] },
	continue: { tokens: ['Button_Continue'] },
	search: { tokens: ['Search'] },
	save: { tokens: ['Button_Save', 'Save'] },
};

export const STEAM_LANGUAGE_TO_LOCALE: Record<string, string> = {
	english: 'en-US', german: 'de-DE', french: 'fr-FR', italian: 'it-IT', koreana: 'ko-KR',
	spanish: 'es-ES', latam: 'es-419', schinese: 'zh-CN', tchinese: 'zh-TW', russian: 'ru-RU',
	thai: 'th-TH', japanese: 'ja-JP', portuguese: 'pt-PT', brazilian: 'pt-BR', polish: 'pl-PL',
	danish: 'da-DK', dutch: 'nl-NL', finnish: 'fi-FI', norwegian: 'nb-NO', swedish: 'sv-SE',
	hungarian: 'hu-HU', czech: 'cs-CZ', romanian: 'ro-RO', turkish: 'tr-TR', arabic: 'ar-SA',
	bulgarian: 'bg-BG', greek: 'el-GR', ukrainian: 'uk-UA', vietnamese: 'vi-VN', indonesian: 'id-ID', malay: 'ms-MY',
};

export function officialSteamText(fallbackEnglish: string, preferredTokens: string[] = []): string {
	const lm = steamLocalizationManager();
	if (!lm) return fallbackEnglish;
	for (const token of preferredTokens) {
		const cleanToken = String(token || '').replace(/^#/, '');
		const localized = lm?.m_mapTokens?.get?.(cleanToken) ?? lm?.Localize?.(cleanToken);
		if (typeof localized === 'string' && localized.trim()) return localized;
		const fallback = lm?.m_mapFallbackTokens?.get?.(cleanToken);
		if (typeof fallback === 'string' && fallback.trim()) return fallback;
	}
	return fallbackEnglish;
}

export function applySteamTemplateValues(text: string, values: Record<string, string | number>, params: string[]): string {
	let result = text;
	for (const [name, value] of Object.entries(values)) {
		result = result.replace(new RegExp(`\\{${escapeRegex(name)}\\}`, 'g'), String(value));
	}
	params.forEach((name, index) => {
		const value = values[name];
		if (value === undefined) return;
		result = result.replace(new RegExp(`%${index + 1}\\$s`, 'g'), String(value));
	});
	return result;
}

const GDL_CUSTOM_LANGUAGE_TRANSLATIONS: Record<string, Record<string, string>> = {
	italian: {
		experimental_title: 'Sperimentale',
		experimental_badge: 'SPERIMENTALE',
		bulk_link_experimental_title: 'Collegamento rapido in massa',
		bulk_link_experimental_description: 'Collega in background solo le corrispondenze ad alta affidabilità senza aprire una finestra per ogni gioco. I casi ambigui restano scollegati per la revisione manuale.',
		bulk_link_running: 'Analisi e collegamento delle corrispondenze affidabili...',
		bulk_link_progress: 'Collegamento {done}/{total}: {game}',
		bulk_link_analyzing_progress: 'Analisi {done}/{total}: {game}',
		bulk_link_analyzing_game: 'Analisi: {game}',
		bulk_link_linking_game: 'Collegamento: {game}',
		bulk_link_not_linked_title: 'Impossibile collegare ({count})',
		bulk_link_retrying_games: 'Completamento ancora in background ({count}): {games}',
		bulk_link_reason_ambiguous: 'Non è stata trovata una corrispondenza sufficientemente affidabile.',
		bulk_link_reason_context: 'Impossibile leggere le informazioni del collegamento.',
		bulk_link_reason_detection: 'Rilevamento dei candidati non riuscito.',
		bulk_link_reason_invalid_appid: 'Lo Steam AppID rilevato non è valido.',
		bulk_link_reason_native: 'La voce non è stata riconosciuta come collegamento non-Steam.',
		bulk_link_reason_incomplete: 'Il collegamento non ha completato tutte le risorse richieste.',
		bulk_link_reason_failed: 'Impossibile completare il collegamento.',
		bulk_link_result: 'Collegamento in massa completato: {linked} collegati, {queued} in coda, {skipped} ambigui ignorati, {failed} non riusciti.',
		bulk_link_failed: 'Impossibile completare il collegamento in massa.',
		bulk_linking_short: 'Collegamento...',
		auto_detect_native_add_description: 'Controlla solo la sessione della finestra nativa di Steam “Aggiungi gioco non di Steam”. Avvio, navigazione, cambio lingua e scollegamento non possono attivare questo avviso. Chiudere o rifiutare un avviso automatico lo blocca permanentemente per quel gioco.',
		auto_detect_shortcuts_toggle: 'Suggerisci il collegamento solo dopo aver aggiunto un gioco dalla finestra nativa di Steam',
		auto_detect_suppressed_count: 'Suggerimenti automatici bloccati permanentemente: {count}.',
		auto_detect_reset_suppressed: 'Ripristina i suggerimenti automatici rifiutati',
		link_management_description: 'Collega o scollega singolarmente i giochi non Steam. La revisione automatica, se attiva, è isolata al flusso nativo di Steam per aggiungere giochi non Steam.',
		activity_end: 'Fine dell’attività',
		link_button: 'Collega', link_game: 'Collega gioco', auto_link_ready_to_review: 'Pronto per la revisione',
		detection_uncertain: 'Scegli il risultato corretto oppure inserisci manualmente l’AppID.',
		manual_appid_label: 'Oppure inserisci manualmente uno Steam AppID', manual_appid_placeholder: 'Steam AppID',
		manual_link_only_description: 'Il collegamento è esclusivamente manuale. GameBridge non apre mai automaticamente una finestra di collegamento.',
		done: 'Fatto',
	},
	portuguese: {
		experimental_title: 'Experimental',
		experimental_badge: 'EXPERIMENTAL',
		bulk_link_experimental_title: 'Vinculação rápida em massa',
		bulk_link_experimental_description: 'Vincula em segundo plano apenas correspondências de alta confiança, sem abrir uma janela por jogo. Casos ambíguos permanecem desvinculados para revisão manual.',
		bulk_link_running: 'A analisar e vincular correspondências de alta confiança...',
		bulk_link_progress: 'A vincular {done}/{total}: {game}',
		bulk_link_analyzing_progress: 'A analisar {done}/{total}: {game}',
		bulk_link_analyzing_game: 'A analisar: {game}',
		bulk_link_linking_game: 'A vincular: {game}',
		bulk_link_not_linked_title: 'Não foi possível vincular ({count})',
		bulk_link_retrying_games: 'Ainda a concluir em segundo plano ({count}): {games}',
		bulk_link_reason_ambiguous: 'Não foi encontrada uma correspondência suficientemente fiável.',
		bulk_link_reason_context: 'Não foi possível ler as informações do atalho.',
		bulk_link_reason_detection: 'A deteção de candidatos falhou.',
		bulk_link_reason_invalid_appid: 'O Steam AppID detetado não é válido.',
		bulk_link_reason_native: 'A entrada não foi reconhecida como um atalho não-Steam.',
		bulk_link_reason_incomplete: 'A vinculação não conseguiu concluir todos os recursos necessários.',
		bulk_link_reason_failed: 'Não foi possível concluir a vinculação.',
		bulk_link_result: 'Vinculação em massa concluída: {linked} vinculados, {queued} em fila, {skipped} ambíguos ignorados, {failed} falharam.',
		bulk_link_failed: 'Não foi possível concluir a vinculação em massa.',
		bulk_linking_short: 'A vincular...',
		auto_detect_native_add_description: 'Só observa a sessão da janela nativa do Steam “Adicionar um jogo que não é do Steam”. O arranque, navegação, mudanças de idioma e desvinculação nunca podem ativar este aviso. Fechar ou rejeitar um aviso automático bloqueia-o permanentemente para esse jogo.',
		auto_detect_shortcuts_toggle: 'Sugerir vinculação apenas depois de adicionar um jogo pela janela nativa do Steam',
		auto_detect_suppressed_count: 'Sugestões automáticas bloqueadas permanentemente: {count}.',
		auto_detect_reset_suppressed: 'Repor sugestões automáticas rejeitadas',
		link_management_description: 'Vincula ou desvincula jogos não Steam individualmente. A revisão automática, se ativa, fica isolada ao fluxo nativo do Steam para adicionar jogos não Steam.',
		activity_end: 'Fim da atividade',
		link_button: 'Vincular', link_game: 'Vincular jogo', auto_link_ready_to_review: 'Pronto para revisão',
		detection_uncertain: 'Escolhe o resultado correto ou introduz o AppID manualmente.',
		manual_appid_label: 'Ou introduz manualmente um Steam AppID', manual_appid_placeholder: 'Steam AppID',
		manual_link_only_description: 'A vinculação é exclusivamente manual. O GameBridge nunca abre automaticamente uma janela de vinculação.',
		done: 'Concluído',
	},
	brazilian: {
		experimental_title: 'Experimental',
		experimental_badge: 'EXPERIMENTAL',
		bulk_link_experimental_title: 'Vinculação rápida em massa',
		bulk_link_experimental_description: 'Vincula em segundo plano apenas correspondências de alta confiança sem abrir uma janela por jogo. Casos ambíguos permanecem desvinculados para revisão manual.',
		bulk_link_running: 'Analisando e vinculando correspondências de alta confiança...',
		bulk_link_progress: 'Vinculando {done}/{total}: {game}',
		bulk_link_analyzing_progress: 'Analisando {done}/{total}: {game}',
		bulk_link_analyzing_game: 'Analisando: {game}',
		bulk_link_linking_game: 'Vinculando: {game}',
		bulk_link_not_linked_title: 'Não foi possível vincular ({count})',
		bulk_link_retrying_games: 'Ainda concluindo em segundo plano ({count}): {games}',
		bulk_link_reason_ambiguous: 'Nenhuma correspondência suficientemente confiável foi encontrada.',
		bulk_link_reason_context: 'Não foi possível ler as informações do atalho.',
		bulk_link_reason_detection: 'A detecção de candidatos falhou.',
		bulk_link_reason_invalid_appid: 'O Steam AppID detectado não é válido.',
		bulk_link_reason_native: 'A entrada não foi reconhecida como um atalho não Steam.',
		bulk_link_reason_incomplete: 'A vinculação não conseguiu concluir todos os recursos necessários.',
		bulk_link_reason_failed: 'Não foi possível concluir a vinculação.',
		bulk_link_result: 'Vinculação em massa concluída: {linked} vinculados, {queued} na fila, {skipped} ambíguos ignorados, {failed} falharam.',
		bulk_link_failed: 'Não foi possível concluir a vinculação em massa.',
		bulk_linking_short: 'Vinculando...',
		auto_detect_native_add_description: 'Observa somente a sessão da janela nativa do Steam “Adicionar um jogo não Steam”. Inicialização, navegação, mudança de idioma e desvinculação nunca podem ativar esse aviso. Fechar ou rejeitar um aviso automático o bloqueia permanentemente para esse jogo.',
		auto_detect_shortcuts_toggle: 'Sugerir vinculação somente depois de adicionar um jogo pela janela nativa do Steam',
		auto_detect_suppressed_count: 'Sugestões automáticas bloqueadas permanentemente: {count}.',
		auto_detect_reset_suppressed: 'Redefinir sugestões automáticas rejeitadas',
		link_management_description: 'Vincule ou desvincule jogos não Steam individualmente. A revisão automática, se ativada, fica isolada ao fluxo nativo do Steam para adicionar jogos não Steam.',
		activity_end: 'Fim da atividade',
		link_button: 'Vincular', link_game: 'Vincular jogo', auto_link_ready_to_review: 'Pronto para revisão',
		detection_uncertain: 'Escolha o resultado correto ou insira o AppID manualmente.',
		manual_appid_label: 'Ou insira manualmente um Steam AppID', manual_appid_placeholder: 'Steam AppID',
		manual_link_only_description: 'A vinculação é exclusivamente manual. O GameBridge nunca abre automaticamente uma janela de vinculação.',
		done: 'Concluído',
	},
	french: {
		experimental_title: 'Expérimental',
		experimental_badge: 'EXPÉRIMENTAL',
		bulk_link_experimental_title: 'Association groupée rapide',
		bulk_link_experimental_description: 'Associe en arrière-plan uniquement les correspondances très fiables sans ouvrir une fenêtre par jeu. Les cas ambigus restent non associés pour vérification manuelle.',
		bulk_link_running: 'Analyse et association des correspondances fiables...',
		bulk_link_progress: 'Association {done}/{total} : {game}',
		bulk_link_analyzing_progress: 'Analyse {done}/{total} : {game}',
		bulk_link_analyzing_game: 'Analyse : {game}',
		bulk_link_linking_game: 'Association : {game}',
		bulk_link_not_linked_title: 'Impossible à associer ({count})',
		bulk_link_retrying_games: 'Finalisation en arrière-plan ({count}) : {games}',
		bulk_link_reason_ambiguous: 'Aucune correspondance suffisamment fiable n’a été trouvée.',
		bulk_link_reason_context: 'Impossible de lire les informations du raccourci.',
		bulk_link_reason_detection: 'La détection des candidats a échoué.',
		bulk_link_reason_invalid_appid: 'Le Steam AppID détecté est invalide.',
		bulk_link_reason_native: 'L’entrée n’a pas été reconnue comme raccourci non-Steam.',
		bulk_link_reason_incomplete: 'L’association n’a pas pu terminer toutes les ressources requises.',
		bulk_link_reason_failed: 'Impossible de terminer l’association.',
		bulk_link_result: 'Association groupée terminée : {linked} associés, {queued} en attente, {skipped} ambigus ignorés, {failed} échecs.',
		bulk_link_failed: 'Impossible de terminer l’association groupée.',
		bulk_linking_short: 'Association...',
		auto_detect_native_add_description: 'Surveille uniquement la session de la fenêtre Steam « Ajouter un jeu non-Steam ». Le démarrage, la navigation, le changement de langue et la dissociation ne peuvent jamais déclencher cette invite. Fermer ou refuser une invite automatique la bloque définitivement pour ce jeu.',
		auto_detect_shortcuts_toggle: 'Suggérer l’association uniquement après l’ajout via la fenêtre native de Steam',
		auto_detect_suppressed_count: 'Suggestions automatiques bloquées définitivement : {count}.',
		auto_detect_reset_suppressed: 'Réinitialiser les suggestions automatiques refusées',
		link_management_description: 'Associez ou dissociez individuellement les jeux non-Steam. La vérification automatique, si activée, est limitée au flux natif Steam d’ajout de jeux non-Steam.',
		activity_end: 'Fin de l’activité',
		link_button: 'Associer', link_game: 'Associer le jeu', auto_link_ready_to_review: 'Prêt à vérifier',
		detection_uncertain: 'Choisissez le bon résultat ou saisissez manuellement l’AppID.',
		manual_appid_label: 'Ou saisissez manuellement un Steam AppID', manual_appid_placeholder: 'Steam AppID',
		manual_link_only_description: 'L’association est uniquement manuelle. GameBridge n’ouvre jamais automatiquement de fenêtre d’association.',
		done: 'Terminé',
	},
	german: {
		experimental_title: 'Experimentell',
		experimental_badge: 'EXPERIMENTELL',
		bulk_link_experimental_title: 'Schnelle Massenverknüpfung',
		bulk_link_experimental_description: 'Verknüpft nur sehr sichere Treffer im Hintergrund, ohne für jedes Spiel einen Dialog zu öffnen. Mehrdeutige Fälle bleiben für die manuelle Prüfung unverknüpft.',
		bulk_link_running: 'Sichere Treffer werden analysiert und verknüpft...',
		bulk_link_progress: 'Verknüpfe {done}/{total}: {game}',
		bulk_link_analyzing_progress: 'Analysiere {done}/{total}: {game}',
		bulk_link_analyzing_game: 'Analysiere: {game}',
		bulk_link_linking_game: 'Verknüpfe: {game}',
		bulk_link_not_linked_title: 'Konnte nicht verknüpft werden ({count})',
		bulk_link_retrying_games: 'Wird noch im Hintergrund abgeschlossen ({count}): {games}',
		bulk_link_reason_ambiguous: 'Es wurde kein ausreichend zuverlässiger Treffer gefunden.',
		bulk_link_reason_context: 'Die Shortcut-Informationen konnten nicht gelesen werden.',
		bulk_link_reason_detection: 'Die Kandidatenerkennung ist fehlgeschlagen.',
		bulk_link_reason_invalid_appid: 'Die erkannte Steam-AppID ist ungültig.',
		bulk_link_reason_native: 'Der Eintrag wurde nicht als Steam-fremder Shortcut erkannt.',
		bulk_link_reason_incomplete: 'Die Verknüpfung konnte nicht alle erforderlichen Ressourcen abschließen.',
		bulk_link_reason_failed: 'Die Verknüpfung konnte nicht abgeschlossen werden.',
		bulk_link_result: 'Massenverknüpfung abgeschlossen: {linked} verknüpft, {queued} in Warteschlange, {skipped} mehrdeutige übersprungen, {failed} fehlgeschlagen.',
		bulk_link_failed: 'Massenverknüpfung konnte nicht abgeschlossen werden.',
		bulk_linking_short: 'Verknüpfen...',
		auto_detect_native_add_description: 'Überwacht ausschließlich die Sitzung des nativen Steam-Dialogs „Steam-fremdes Spiel hinzufügen“. Start, Navigation, Sprachwechsel und Aufheben von Verknüpfungen können diesen Hinweis niemals auslösen. Schließen oder Ablehnen sperrt den automatischen Hinweis dauerhaft für dieses Spiel.',
		auto_detect_shortcuts_toggle: 'Verknüpfung nur nach Hinzufügen über den nativen Steam-Dialog vorschlagen',
		auto_detect_suppressed_count: 'Dauerhaft blockierte automatische Vorschläge: {count}.',
		auto_detect_reset_suppressed: 'Abgelehnte automatische Vorschläge zurücksetzen',
		link_management_description: 'Steam-fremde Spiele einzeln verknüpfen oder trennen. Die automatische Prüfung ist, falls aktiviert, ausschließlich auf Steams nativen Hinzufügen-Dialog begrenzt.',
		activity_end: 'Ende der Aktivität',
		link_button: 'Verknüpfen', link_game: 'Spiel verknüpfen', auto_link_ready_to_review: 'Bereit zur Prüfung',
		detection_uncertain: 'Wähle das richtige Ergebnis oder gib die AppID manuell ein.',
		manual_appid_label: 'Oder Steam-AppID manuell eingeben', manual_appid_placeholder: 'Steam-AppID',
		manual_link_only_description: 'Die Verknüpfung erfolgt ausschließlich manuell. GameBridge öffnet niemals automatisch ein Verknüpfungsfenster.',
		done: 'Fertig',
	},
};

export function gdlText(key: string, fallbackEnglish: string, values: Record<string, string | number> = {}): string {
	let spec = GDL_STEAM_TOKEN_SPECS[key] || {};
	if (key === 'achievements_unlocked' && Number(values.unlocked) >= Number(values.total) && Number(values.total) > 0) {
		spec = { ...spec, tokens: ['AppDetails_PlayerUnlockedPercentAll', ...(spec.tokens || [])] };
	}
	const params = spec.params || Object.keys(values);
	let localized = officialSteamText(fallbackEnglish, spec.tokens || []);
	if (localized === fallbackEnglish) {
		const language = String(steamLanguageSync() || '').toLowerCase();
		localized = GDL_CUSTOM_LANGUAGE_TRANSLATIONS[language]?.[key] || localized;
	}
	if (localized === fallbackEnglish && isSpanishLanguage()) {
		localized = SPANISH_TRANSLATIONS[key] || SPANISH_TOKEN_FALLBACKS[key] || fallbackEnglish;
	}
	return applySteamTemplateValues(localized, values, params);
}

export function steamIntlLocale(): string {
	return STEAM_LANGUAGE_TO_LOCALE[String(steamLanguageSync() || 'english').toLowerCase()] || 'en-US';
}
