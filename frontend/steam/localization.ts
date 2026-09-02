import { backendLog } from '../api/backend';
import { escapeRegex } from '../core/text';
import { OTHER_LANGUAGE_TRANSLATIONS } from './custom-translations';

let localizationDocumentProvider: (() => Document | null) | null = null;

export function setLocalizationDocumentProvider(provider: (() => Document | null) | null): void {
	localizationDocumentProvider = provider;
}

export function steamLocalizationManager(): any | null {
	try {
		const providedDocument = localizationDocumentProvider?.() || null;
		if ((window as any).LocalizationManager) return (window as any).LocalizationManager;
		if ((providedDocument?.defaultView as any)?.LocalizationManager) return (providedDocument?.defaultView as any).LocalizationManager;
		if ((document?.defaultView as any)?.LocalizationManager) return (document?.defaultView as any).LocalizationManager;
		if ((window as any).parent?.LocalizationManager) return (window as any).parent.LocalizationManager;
		if ((window as any).top?.LocalizationManager) return (window as any).top.LocalizationManager;
		if ((window as any).opener?.LocalizationManager) return (window as any).opener.LocalizationManager;
		const popupMap = (window as any).g_PopupManager?.m_mapPopups;
		if (popupMap && typeof popupMap.values === 'function') {
			for (const popup of popupMap.values()) {
				const lm = popup?.m_popup?.LocalizationManager || popup?.value?.LocalizationManager || popup?.LocalizationManager;
				if (lm) return lm;
			}
		}
		return null;
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
	AppDetails_SectionTitle_Controller: 'Control',
	AppDetailsControllerSection_Title_Supported_Xbox: 'Compatible con tu control de Xbox',
	AppDetailsControllerSection_Title_Supported_DualShock: 'Compatible con tu control DualShock',
	AppDetailsControllerSection_Title_Supported_Dualsense: 'Compatible con tu control DualSense',
	AppDetailsControllerSection_Title_Supported_Generic: 'Compatible con tu control',
	AppDetailsControllerSection_DevSupported: 'Este juego debería funcionar muy bien con tu control',
	AppControllerConfiguration_Link: 'Ver los ajustes del control',
	AppDetails_SectionTitle_Friends: 'Amigos que juegan',
	AppDetails_Friends_Who_Play: 'Amigos que juegan',
	AppDetails_Friends_PlayedPreviously: '%1$s amigos lo jugaron antes',
	AppDetails_Friends_PlayedPreviously_Single: '1 amigo lo jugó antes',
	AppDetails_Friends_PlayedRecently: '%1$s amigos jugaron recientemente',
	AppDetails_Friends_PlayedRecently_Single: '1 amigo jugó recientemente',
	AppDetails_Friends_Wishlist_Single: '1 amigo tiene %1$s en su lista de deseados',
	AppDetails_Friends_Wishlist_Plural: '%1$s amigos tienen %2$s en su lista de deseados',
	AppDetails_Friends_Wishlist: '%1$s amigos tienen %2$s en su lista de deseados',
	AppDetails_Friends_ViewAll: 'Ver todos los amigos que lo juegan',
	AppDetails_ViewAllFriendsWhoPlay: 'Ver todos los amigos que lo juegan',
	AppDetails_Achievement_ViewAllAchievements: 'Ver todos mis logros',
	AppDetails_ViewAllAchievements: 'Ver todos mis logros',
	AppDetails_Achievements_ViewAll: 'Ver todos mis logros',
};

export const SPANISH_TRANSLATIONS: Record<string, string> = {
	controller_section_title: 'Control',
	controller_supported_xbox: 'Compatible con tu control de Xbox',
	controller_supported_dualshock: 'Compatible con tu control DualShock',
	controller_supported_dualsense: 'Compatible con tu control DualSense',
	controller_supported_generic: 'Compatible con tu control',
	controller_supported_desc: 'Este juego debería funcionar muy bien con tu control',
	controller_settings_link: 'Ver los ajustes del control',
	activity: 'Actividad',
	post_placeholder: 'Diles algo sobre este juego a tus amigos...',
	publish: 'Publicar',
	fetch_more: 'Cargar más actividad',
	activity_end: 'Fin de la actividad',
	community_content: 'Contenido de la comunidad',
	achievements_label: 'Logros',
	achievements_unlocked: '{unlocked} de {total} logros desbloqueados',
	all_achievements_unlocked: '¡Has desbloqueado todos los logros! {unlocked}/{total}',
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
	historical_record: 'Ficha histórica',
	information: 'Información',
	retired_from_store: 'Retirado de la tienda',
	genre_label: 'Género',
	steam_release_label: 'Lanzamiento en Steam',
	controller_support_label: 'Compatibilidad con control',
	no_steam_achievements: 'Sin logros de Steam',
	no_steam_achievements_detail: 'No existe un esquema público de Steam para este AppID.',
	view_historical_record: 'Ver ficha histórica',
	legacy_pes2013_description: 'Pro Evolution Soccer 2013 vuelve a sus raíces poniendo el énfasis en la habilidad individual de los mejores jugadores del mundo y ofreciendo libertad total para jugar con cualquier estilo.',
	legacy_blur_description: 'Blur combina carreras intensas con combate vehicular: recoge y utiliza potenciadores mientras compites en ubicaciones reales, tanto en eventos para un jugador como multijugador.',
	legacy_blur_xbox_status: '1 logro descontinuado · 1 parcialmente descontinuado',
	legacy_blur_trophy_breakdown: '1 Platino · 2 Oro · 10 Plata · 36 Bronce',
	genre_sports: 'Deportes',
	genre_racing: 'Carreras',
	legacy_description_developer_genre: '{name} es un título de {genre} desarrollado por {developer}.',
	legacy_description_developer: '{name} fue desarrollado por {developer}.',
	other_platform_achievements: 'Logros en otras plataformas',
	external_achievements_total: '{count} logros',
	external_trophies_total: '{count} trofeos',
	external_achievements_discontinued: '{count} logros descontinuados',
	external_trophy_breakdown: '1 Platino · 3 Oro · 21 Plata · 4 Bronce',
	featured_community: 'Comunidad destacada',
	guide_label: 'Guía',
	screenshot_label: 'Captura',
	community_historical_available: 'El contenido de Steam Community continúa disponible para este juego.',
	view_community_hub: 'Ver Punto de encuentro',
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
	game_simulated_achievements_description: 'Muestra progreso usando los nombres e iconos reales de Steam.',
	game_simulate_count_title: 'Logros simulados',
	game_simulate_count_desc: 'Selecciona cuántos logros simular para este juego (0 para usar logros reales).',
	game_simulate_count_offline_title: 'Logros offline simulados',
	game_simulate_count_offline_desc: 'Selecciona cuántos logros offline simular para este juego (los logros online se controlan por separado).',
	game_simulate_online_count_title: 'Logros online simulados',
	game_simulate_online_count_desc: 'Selecciona cuántos logros online simular para este juego.',
	game_simulate_percent_title: 'Logros simulados',
	game_simulate_percent_desc: 'Selecciona cuántos logros simular para este juego.',
	game_simulate_percent_offline_title: 'Logros offline simulados',
	game_simulate_percent_offline_desc: 'Selecciona cuántos logros offline simular para este juego (los logros online se controlan por separado).',
	game_simulate_online_percent_title: 'Logros online simulados',
	game_simulate_online_percent_desc: 'Selecciona cuántos logros online simular para este juego.',
	game_online_achievements_title: 'Desbloquear solo logros online',
	game_online_achievements_description: 'También desbloquea los logros identificados como online, multijugador o cooperativos.',
	game_achievement_options_reset: 'Usar logros reales',
	game_achievement_options_use_real: 'Usar logros reales',
	game_achievement_real_priority_hint: 'Al usar logros reales se leerá primero la ruta personalizada de este juego y, si no está configurada, las carpetas automáticas de los ajustes del plugin.',
	game_achievement_options_local: 'Usando opciones de simulación guardadas para este juego.',
	game_achievement_options_global: 'Usando los valores globales del plugin.',
	game_achievement_options_real_per_game: 'Usando la ruta personalizada de logros de este juego.',
	game_achievement_options_real_global: 'Usando logros reales desde las carpetas automáticas del plugin.',
	game_achievement_path_simulation_blocked: 'Los logros simulados están activos; no se puede usar a la vez una ruta de progreso personalizada.',
	game_achievement_path_zero_blocked: 'El progreso local está desactivado para este juego; se mostrará la lista real de Steam al 0 %.',
	game_achievement_options_saving: 'Guardando opciones de logros...',
	game_achievement_options_failed: 'No se pudieron guardar las opciones de logros.',
	game_achievement_picker_btn: 'Personalizar logros individualmente',
	game_achievement_picker_title: 'Selector de logros simulados',
	game_achievement_picker_desc: 'Haz clic en cada logro para activarlo o desactivarlo. Los logros en color se mostrarán como desbloqueados y los apagados como bloqueados.',
	game_achievement_picker_select_all: 'Seleccionar todos',
	game_achievement_picker_deselect_all: 'Deseleccionar todos',
	game_achievement_picker_select_offline: 'Solo offline',
	game_achievement_picker_select_online: 'Solo online',
	game_achievement_picker_save: 'Guardar y aplicar',
	game_achievement_picker_export: 'Exportar a achievements.json (Fusión inteligente)',
	game_achievement_picker_exporting: 'Exportando y fusionando logros...',
	game_achievement_picker_export_success: 'Logros exportados y fusionados con éxito en {path}. Usando logros reales.',
	game_achievement_picker_export_failed: 'No se pudo exportar el archivo de logros.',
	game_achievement_picker_cancel: 'Cancelar',
	game_achievement_picker_count: '{selected} de {total} logros seleccionados',
	game_achievement_picker_search: 'Buscar logro...',
	game_achievement_picker_no_results: 'No se encontraron logros coincidentes.',
	game_achievement_export_path_label: 'Ruta de exportación:',
	game_achievement_picker_sync_steam: 'Sincronizar con cuenta de Steam',
	game_achievement_picker_syncing: 'Sincronizando con los servidores de Steam...',
	game_achievement_picker_sync_success: 'Logros sincronizados con éxito en tu cuenta de Steam.',
	game_achievement_picker_sync_failed: 'No se pudieron sincronizar los logros con tu cuenta de Steam (asegúrate de que posees el juego y Steam está abierto).',
	game_achievement_picker_sync_confirm: '¿Deseas sincronizar los logros seleccionados directamente con tu cuenta oficial de Steam?',
	native_steam_achievements_title: 'Logros de Steam (NativeGameLink)',
	native_steam_achievements_desc: 'Gestiona, personaliza y sincroniza los logros oficiales de este juego directamente en tu cuenta de Steam.',
	native_steam_achievements_manage_btn: '☁️ Gestionar y sincronizar logros en Steam',
	native_steam_achievements_loading: 'Cargando logros de Steam...',
	native_steam_achievements_picker_title: 'Selector de logros de Steam',
	native_steam_achievements_picker_desc: 'Selecciona los logros que deseas sincronizar con tu cuenta oficial de Steam. Steam confirmará los cambios guardados.',
	native_steam_achievements_no_achievements: 'Este juego no contiene logros en Steam.',
	native_steam_card_farming_title: 'Farmeo de cromos de Steam (NativeGameLink)',
	native_steam_card_farming_desc: 'Simula la ejecución del juego en segundo plano para que Valve suelte las tarjetas/cromos oficiales directamente en tu inventario de Steam.',
	native_steam_card_farming_start_btn: '🃏 Iniciar farmeo de cromos',
	native_steam_card_farming_stop_btn: '⏹️ Detener farmeo de cromos',
	native_steam_card_farming_active_status: '🟢 Farmeando cromos ({elapsed} transcurridos)...',
	native_steam_card_farming_started: 'Farmeo de cromos iniciado en segundo plano.',
	native_steam_card_farming_stopped: 'Farmeo de cromos detenido.',
	native_steam_card_farming_failed: 'No se pudo iniciar el farmeo de cromos.',
	no_match_found: 'No se encontró una coincidencia confiable. Puedes introducir el AppID manualmente.',
	shortcut_suggestions_title: 'Sugerencias de Steam AppID:',
	no_suggestions_found: 'Sin sugerencias automáticas (introduce el AppID abajo)',
	current_linked_option: 'Juego vinculado actualmente (AppID {appid})',
	detecting_game: 'Detectando el juego automáticamente...',
	detected_game: 'Detectado: {name}. Revisa el resultado y pulsa Vincular para vincularlo.',
	detection_ready: 'La detección automática está lista para confirmar.',
	detection_uncertain: 'La coincidencia es incierta. Elige el resultado correcto o introduce el AppID manualmente.',
	use_tracking_executable: 'Usar el ejecutable real del juego',
	tracking_executable_help: '{bootstrap} se cierra después de iniciar {game}. Usa {game} para que Steam registre tus horas de juego.',
	persistent_launcher_rdr2_note: 'Launcher.exe es el hilo principal de este juego necesario para que Steam registre tus horas de juego correctamente.',
	persistent_tracking_exe_note: '{exe} es el hilo principal de este juego necesario para que Steam registre tus horas de juego correctamente.',
	locked_achievements: 'Logros bloqueados',
	view_all_achievements: 'Ver todos mis logros',
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
	settings_title: 'NativeGameLink for Steam',
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
	bulk_link_all_success: 'Vinculación masiva completada: todos los {total} juegos vinculados correctamente.',
	bulk_link_success_pending: 'Vinculación masiva completada: {linked} de {total} vinculados ({pending} configurando arte en segundo plano).',
	bulk_link_result: 'Vinculación masiva completada: {linked} vinculados, {queued} en segundo plano, {skipped} ambiguos omitidos, {failed} fallidos.',
	bulk_link_failed: 'No se pudo completar la vinculación masiva.',
	bulk_link_cancelled: 'Vinculación masiva cancelada.',
	bulk_linking_short: 'Vinculando...',
	link_management_description: 'Vincula o desvincula juegos externos individualmente. La revisión automática, si está habilitada, queda aislada al flujo nativo de Steam para añadir juegos que no son de Steam.',
	link_management_title: 'Gestión de vinculaciones',
	manual_link_only_description: 'La vinculación es únicamente manual. NativeGameLink nunca abre una ventana de vinculación automáticamente.',
	link_management_summary: '{linked} de {total} juego(s) que no son de Steam están vinculados.',
	link_management_empty: 'No hay juegos que no sean de Steam disponibles actualmente.',
	link_all_button: 'Vincular todos',
	unlink_all_button: 'Desvincular todos',
	link_button: 'Vincular',
	link_searching: 'Buscando coincidencias de Steam…',
	game_linked_status: 'Vinculado',
	game_linked_appid: 'Vinculado · Steam AppID {appid}',
	game_unlinked_status: 'Desvinculado',
	linking_progress_button: 'Vinculando...',
	manual_link_success: 'Acceso directo vinculado a Steam con éxito.',
	manual_link_review_started: 'Revisión de vinculación abierta para {game}.',
	manual_link_review_failed: 'No se pudo iniciar la revisión de vinculación para {game}.',
	bulk_link_started: 'Revisión manual de vinculación iniciada para {count} juego(s).',
	bulk_link_none: 'No hay juegos desvinculados para revisar.',
	bulk_unlinking: 'Desvinculando todos los juegos de NativeGameLink...',
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
	link_queued_retrying: 'Reintentando la vinculación en segundo plano (intento {attempts}).',
	link_queued_complete: '✓ La vinculación en segundo plano se completó. El juego ya está listo en tu biblioteca.',
	link_queued_failed: 'La vinculación en segundo plano no pudo completarse. Puedes intentarlo de nuevo.',
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
	link_incomplete_retrying: 'La vinculación todavía no está completa. NativeGameLink reintentará hasta que nombre, icono y portadas estén listos.',
	linked_official: '✓ Vinculado a “{name}”. Nombre e icono oficiales actualizados.',
	linked_name: '✓ Vinculado a “{name}”. Nombre oficial actualizado; el icono oficial no estaba disponible.',
	linked_reopen: '✓ Vinculado a “{name}”. Es posible que debas reiniciar Steam para ver el nuevo icono.',
	tracking_executable_updated: ' Steam ejecutará ahora el proceso principal del juego para registrar tu tiempo de juego.',
	local_note_updated: ' Nota local actualizada.',
	linked_open_save: '✓ Vinculado a “{name}”. Abre la página del juego y pulsa Vincular para actualizar su nombre e icono.',
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
	add_comment: 'Escribe una respuesta...',
	reply: 'Responder',
	delete_comment: 'Eliminar respuesta',
	comments_count: '{count} respuestas',
	comments_count_single: '1 respuesta',
	recent_playtime_hours: '{count} horas jugadas recientemente',
	recent_playtime_minutes: '{count} minutos jugados recientemente',
	friends_recently_played_single: '1 amigo jugó recientemente',
	friends_recently_played: '{count} amigos jugaron recientemente',
	show_all_recently_played: 'Mostrar todos los jugados recientemente ({count} más)',
	friends_previously_played_single: '1 amigo lo jugó antes',
	friends_previously_played: '{count} amigos lo jugaron antes',
	friends_who_play_single: '1 amigo juega a este juego',
	friends_who_play: '{count} amigos juegan a este juego',
	show_all_previously_played: 'Mostrar todos los que jugaron antes ({count} más)',
	friends_wishlisted_single: '1 amigo tiene {game} en su lista de deseados',
	friends_wishlisted_plural: '{count} amigos tienen {game} en su lista de deseados',
	show_all_wishlisted: 'Mostrar todos los de la lista de deseados ({count} más)',
	view_all_friends: 'Ver todos los amigos que lo juegan',
	enter_appid: 'Introduce un AppID o enlace de la tienda.',
	enter_numeric_appid: 'Introduce un AppID numérico o enlace de una página de la tienda.',
	done: 'Listo',
	more_links: 'Más enlaces',
	steamgriddb_artwork_title: 'Artwork comunitario (SteamGridDB)',
	steamgriddb_artwork_description: 'Sólo se consulta si Steam no publicó una portada, fondo, logo o cápsula. Nunca reemplaza artwork oficial.',
	steamgriddb_auto_artwork: 'Aplicar automáticamente recursos de SteamGridDB que falten',
	steamgriddb_api_key_placeholder: 'API key de SteamGridDB (se guarda sólo localmente)',
	steamgriddb_api_key_restore: 'Restaurar clave predeterminada',
	steamgriddb_api_key_verifying: 'Comprobando la clave con SteamGridDB...',
	steamgriddb_api_key_saved: 'Clave de SteamGridDB guardada y verificada correctamente.',
	steamgriddb_api_key_restored: 'Clave predeterminada restaurada y verificada correctamente.',
	steamgriddb_api_key_required: 'Introduce una clave de SteamGridDB válida.',
	steamgriddb_api_key_invalid: 'SteamGridDB rechazó la clave. La clave anterior continúa activa.',
	steamgriddb_api_key_unavailable: 'No se pudo contactar con SteamGridDB. La clave anterior continúa activa.',
	steamgriddb_contributed: ' SteamGridDB aportó: {assets}.',
	game_artwork_picker_title: 'Artwork de la biblioteca',
	game_artwork_picker_desc: 'Elige artwork alternativo de SteamGridDB para este juego retirado. Tu selección reemplaza los valores predeterminados sólo para este acceso directo.',
	game_artwork_picker_desc_native: 'Elige artwork alternativo de SteamGridDB para este juego de Steam. Tu selección cambia sólo el artwork de tu biblioteca local.',
	game_artwork_picker_open: 'Elegir artwork',
	game_artwork_picker_reset: 'Restablecer artwork',
	game_artwork_picker_resetting: 'Restableciendo...',
	game_artwork_picker_reset_success: 'Artwork predeterminado del plugin restaurado.',
	game_artwork_picker_reset_failed: 'No se pudo restaurar el artwork predeterminado. Inténtalo de nuevo.',
	game_artwork_picker_modal_desc: 'Selecciona una imagen para cada espacio de la biblioteca de Steam. El borde azul indica la imagen que se aplicará.',
	game_artwork_slot_portrait: 'Carátula vertical',
	game_artwork_slot_hero: 'Fondo amplio',
	game_artwork_slot_logo: 'Logo',
	game_artwork_slot_wide: 'Cápsula horizontal',
	game_artwork_picker_defaults: 'Usar recomendados',
	game_artwork_picker_apply: 'Aplicar artwork',
	game_artwork_picker_applying: 'Aplicando...',
	game_artwork_picker_loading: 'Cargando artwork...',
	game_artwork_picker_empty: 'No se encontró artwork compatible para este espacio.',
	game_artwork_picker_summary: '{selected} de {total} espacios seleccionados · Fuente: SteamGridDB',
	game_artwork_picker_api_key: 'Primero añade tu API key de SteamGridDB en los ajustes de NativeGameLink.',
	game_artwork_picker_no_appid: 'Vincula este juego a un AppID de Steam para elegir artwork.',
	game_artwork_picker_unavailable: 'Puedes buscar artwork manualmente con tu clave de SteamGridDB.',
	game_artwork_picker_load_failed: 'No se pudo cargar el artwork de SteamGridDB. Comprueba la API key y la conexión.',
	game_artwork_picker_success: 'El artwork seleccionado se aplicó y quedó guardado para este acceso directo.',
	game_artwork_picker_failed: 'No se pudo aplicar parte del artwork. Comprueba la conexión e inténtalo de nuevo.',
	link_complete_title: '✓ Vinculación completada.',
	link_complete_body: 'Nombre oficial, icono y las cuatro imágenes de biblioteca se aplicaron correctamente.',
	link_ready_library: 'El juego ya está listo en tu biblioteca.',
	link_warning_title: 'Vinculado con avisos.',
	link_warning_icon: 'No se pudo aplicar el icono oficial. ',
	link_warning_missing: ' Faltan: {assets}.',
	link_warning_fallback: 'Cuando Steam no publica una pieza de biblioteca, se conserva su arte oficial disponible como alternativa.',
	link_saved_review: 'La vinculación se guardó; revisa los recursos indicados.',
	shortcut_rename_pending: 'Steam está actualizando la identidad del acceso directo. NativeGameLink terminará la vinculación en segundo plano sin utilizar la entrada anterior.',
	appid_not_found: 'No se encontró el AppID {id} en Steam.',
	save_failed: 'No se pudo guardar.',
	recent: 'Reciente',
	user_status: 'Publicación de estado',
};

export function detectSynchronousSteamLanguage(): string | null {
	const normalizeDetectedLanguage = (value: unknown): string | null => {
		const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
		if (!raw || !/^[a-z0-9-]+$/i.test(raw)) return null;
		const base = raw.split('-')[0];
		const mapped = LOCALE_TO_STEAM_LANG[raw] || LOCALE_TO_STEAM_LANG[base] || raw.replace(/-/g, '_');
		return /^[a-z0-9_]+$/i.test(mapped) ? mapped : null;
	};
	try {
		const lm = steamLocalizationManager();
		if (lm) {
			const strELang = String(lm.m_strELanguage || lm.m_strLanguage || lm.m_Language || '').toLowerCase();
			const normalized = normalizeDetectedLanguage(strELang);
			if (normalized) return normalized;
			const locales: string[] = lm.m_rgLocalesToUse || [];
			for (const raw of locales) {
				const detected = normalizeDetectedLanguage(raw);
				if (detected) return detected;
			}
		}
	} catch {}

	try {
		const sc = (window as any).SteamClient || (window as any).parent?.SteamClient || (window as any).opener?.SteamClient;
		const syncLang = sc?.Settings?.GetCurrentLanguageSync?.() || sc?.User?.GetLanguageSync?.() || sc?.System?.GetLanguageSync?.();
		const normalized = normalizeDetectedLanguage(syncLang);
		if (normalized) return normalized;
	} catch {}

	try {
		const gStr = String((window as any).g_strLanguage || (window as any).parent?.g_strLanguage || (window as any).opener?.g_strLanguage || '').toLowerCase();
		const normalized = normalizeDetectedLanguage(gStr);
		if (normalized) return normalized;
	} catch {}

	try {
		const docLang = String(document.documentElement.lang || document.querySelector('html')?.getAttribute('lang') || (window as any).parent?.document?.documentElement?.lang || (window as any).opener?.document?.documentElement?.lang || '').toLowerCase();
		const normalized = normalizeDetectedLanguage(docLang);
		if (normalized) return normalized;
	} catch {}

	try {
		const ach = loc('AppDetails_SectionTitle_Achievements', '');
		if (ach && LANG_FINGERPRINT[ach]) {
			const tie = LANG_TIEBREAK[ach];
			if (tie) {
				return tie[loc('AppDetails_SectionTitle_Friends', '')] || Object.values(tie)[0];
			}
			return LANG_FINGERPRINT[ach];
		}
	} catch {}

	try {
		const navLang = String(navigator.language || (navigator as any).userLanguage || '').toLowerCase();
		if (navLang) {
			if (LOCALE_TO_STEAM_LANG[navLang]) return LOCALE_TO_STEAM_LANG[navLang];
			const base = navLang.split('-')[0];
			if (LOCALE_TO_STEAM_LANG[base]) return LOCALE_TO_STEAM_LANG[base];
		}
	} catch {}

	return null;
}

export function isSpanishLanguage(): boolean {
	const lang = String(steamLanguageSync() || detectSynchronousSteamLanguage() || '').toLowerCase();
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

let lastSynchronousLanguageProbe = 0;

export function steamLanguageSync(): string | null {
	const now = Date.now();
	if (_steamLanguage && now - lastSynchronousLanguageProbe < 1000) return _steamLanguage;
	lastSynchronousLanguageProbe = now;
	const syncDetected = detectSynchronousSteamLanguage();
	if (syncDetected) {
		if (syncDetected !== _steamLanguage) commitSteamLanguage(syncDetected);
		return _steamLanguage || syncDetected;
	}
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
	const raw = String(language || '').toLowerCase().replace(/_/g, '-');
	const base = raw.split('-')[0];
	const mapped = LOCALE_TO_STEAM_LANG[raw] || LOCALE_TO_STEAM_LANG[base] || raw.replace(/-/g, '_');
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
	// Steam client always restarts whenever the user changes interface language.
}

export function stopSteamLanguageWatcher(): void {
	if (!steamLanguageWatchTimer) return;
	clearInterval(steamLanguageWatchTimer);
	steamLanguageWatchTimer = null;
}

export async function getSteamLanguage(forceRefresh = false): Promise<string> {
	if (_steamLanguage && !forceRefresh) return _steamLanguage;
	let lang = '';

	// 1. Ask the client directly
	try {
		const sc = (window as any).SteamClient || (window as any).parent?.SteamClient || (window as any).opener?.SteamClient;
		if (typeof sc?.Settings?.GetCurrentLanguage === 'function') {
			const l = await sc.Settings.GetCurrentLanguage();
			if (typeof l === 'string' && /^[a-z0-9_-]+$/i.test(l)) lang = l;
		} else if (typeof sc?.User?.GetLanguage === 'function') {
			const l = await sc.User.GetLanguage();
			if (typeof l === 'string' && /^[a-z0-9_-]+$/i.test(l)) lang = l;
		} else if (typeof sc?.System?.GetLanguage === 'function') {
			const l = await sc.System.GetLanguage();
			if (typeof l === 'string' && /^[a-z0-9_-]+$/i.test(l)) lang = l;
		}
	} catch {}

	// 2. Synchronous detect via manager, cookies or fingerprinting
	if (!lang) {
		const sync = detectSynchronousSteamLanguage();
		if (sync) lang = sync;
	}

	if (lang) {
		const committed = commitSteamLanguage(lang);
		backendLog('Steam language detected: ' + committed);
		return committed;
	}
	return _steamLanguage || 'english';
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
	all_achievements_unlocked: { tokens: ['AppDetails_PlayerUnlockedPercentAll', 'AppDetails_PlayerUnlockedPercent'], params: ['unlocked', 'total'] },
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
	friends_recently_played_single: { tokens: ['AppDetails_Friends_PlayedRecently_Single', 'AppDetails_Friends_PlayedRecently'] },
	friends_recently_played: { tokens: ['AppDetails_Friends_PlayedRecently'], params: ['count'] },
	friends_previously_played_single: { tokens: ['AppDetails_Friends_PlayedPreviously_Single', 'AppDetails_Friends_PlayedPreviously'] },
	friends_previously_played: { tokens: ['AppDetails_Friends_PlayedPreviously'], params: ['count'] },
	friends_who_play_single: { tokens: ['AppDetails_Friends_Who_Play_Single', 'AppDetails_Friends_Who_Play', 'AppDetails_SectionTitle_Friends'] },
	friends_who_play: { tokens: ['AppDetails_Friends_Who_Play', 'AppDetails_SectionTitle_Friends'], params: ['count'] },
	friends_wishlisted_single: { tokens: ['AppDetails_Friends_Wishlist_Single', 'AppDetails_Friends_WishlistSingle', 'AppDetails_Friends_OnWishlist', 'AppDetails_Friends_Wishlist'], params: ['game'] },
	friends_wishlisted_plural: { tokens: ['AppDetails_Friends_Wishlist_Plural', 'AppDetails_Friends_WishlistPlural', 'AppDetails_Friends_OnWishlist_Plural', 'AppDetails_Friends_Wishlist'], params: ['count', 'game'] },
	show_all_wishlisted: { tokens: ['AppDetails_Friends_ShowAllWishlisted', 'AppDetails_Friends_ShowAllWishlist'], params: ['count'] },
	view_all_friends: { tokens: ['AppDetails_Friends_ViewAll', 'AppDetails_ViewAllFriendsWhoPlay'] },
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
	spanish: SPANISH_TRANSLATIONS,
	latam: SPANISH_TRANSLATIONS,
	...OTHER_LANGUAGE_TRANSLATIONS,
};

export function gdlText(key: string, fallbackEnglish: string, values: Record<string, string | number> = {}): string {
	let spec = GDL_STEAM_TOKEN_SPECS[key] || {};
	if (key === 'achievements_unlocked' && Number(values.unlocked) >= Number(values.total) && Number(values.total) > 0) {
		spec = { ...spec, tokens: ['AppDetails_PlayerUnlockedPercentAll', ...(spec.tokens || [])] };
	}
	const params = spec.params || Object.keys(values);
	let localized = officialSteamText(fallbackEnglish, spec.tokens || []);
	if (localized === fallbackEnglish) {
		const language = String(steamLanguageSync() || detectSynchronousSteamLanguage() || '').toLowerCase();
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
