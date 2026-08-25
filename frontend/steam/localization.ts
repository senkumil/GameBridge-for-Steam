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
	AppDetails_SectionTitle_TradingCards: 'Cromos',
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
	trading_cards: 'Cromos',
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
	linked_title: 'Juego vinculado',
	linked_description: 'Pega un Steam AppID o enlace de la tienda de Steam para mostrar la información del juego en esta página de la biblioteca.',
	appid_placeholder: 'Steam AppID o enlace de la tienda de Steam',
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
	locked_achievements: 'Logros bloqueados',
	view_all_achievements: 'Ver todos los logros',
	view_dlc_store: 'Ver DLC en la tienda',
	view_my_cards: 'Ver mis cromos',
	cards_found: 'Cromos encontrados',
	cards_remaining: '{count} cromos restantes',
	experience_points: '100 de EXP',
	recent_emoticons: 'EMOTICONOS RECIENTES',
	all_emoticons: 'TODOS LOS EMOTICONOS',
	explore_workshop: 'Explora el contenido creado por la comunidad para este juego.',
	visit_workshop: 'Visitar este Workshop',
	trending_item: 'Artículo popular',
	settings_title: 'GameBridge for Steam',
	settings_description: 'Haz clic derecho en cualquier juego que no sea de Steam → Propiedades → introduce un Steam AppID vinculado. La página de la biblioteca mostrará su descripción, capturas de pantalla y metadatos.',
	achievement_path_title: 'Carpeta local de logros',
	achievement_path_description: 'Elige la carpeta base que contiene una subcarpeta por juego: <carpeta>\\<Steam AppID>\\achievements.json. El AppID vinculado oficial se comprueba primero.',
	achievement_path_placeholder: 'Ejemplo: %APPDATA%\\Goldberg SteamEmu Saves',
	achievement_path_loading: 'Cargando carpeta actual...',
	achievement_path_save: 'Guardar carpeta',
	achievement_path_reset: 'Restaurar predeterminado',
	achievement_path_saved: 'Carpeta de logros guardada.',
	achievement_path_failed: 'No se pudo guardar la carpeta de logros.',
	achievement_test_title: 'Probar notificaciones de logros',
	achievement_test_description: 'Envía una notificación de logro aleatoria con sonido para probar que las notificaciones funcionan.',
	achievement_test_loading: 'Enviando notificación de prueba...',
	achievement_test_button: 'Probar notificación (con sonido)',
	achievement_test_sent: '✓ Notificación de prueba enviada: {game} — {achievement}',
	achievement_test_failed: 'No se pudo mostrar la notificación de prueba. Revisa el registro de Millennium.',
	auto_detect_title: 'Detección automática de accesos directos',
	auto_detect_description: 'Sugiere vincular cuando se añaden nuevos juegos que no son de Steam a tu biblioteca.',
	auto_detect_shortcuts_toggle: 'Mostrar sugerencia de vinculación al añadir un juego que no sea de Steam',
	developer_tools_title: 'Herramientas de desarrollador',
	developer_tools_description: 'Las opciones de prueba están deshabilitadas de forma predeterminada para instalaciones públicas.',
	developer_mode: 'Habilitar modo desarrollador',
	simulate_achievements: 'Mostrar logros de prueba deterministas cuando no existe un archivo de progreso local',
	view_linked_achievements: 'Ver logros de este juego vinculado',
	emoticons: 'Emoticonos',
};

export function isSpanishLanguage(): boolean {
	const lang = String(steamLanguageSync() || '').toLowerCase();
	return lang === 'spanish' || lang === 'latam';
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

export function gdlText(key: string, fallbackEnglish: string, values: Record<string, string | number> = {}): string {
	let spec = GDL_STEAM_TOKEN_SPECS[key] || {};
	if (key === 'achievements_unlocked' && Number(values.unlocked) >= Number(values.total) && Number(values.total) > 0) {
		spec = { ...spec, tokens: ['AppDetails_PlayerUnlockedPercentAll', ...(spec.tokens || [])] };
	}
	const params = spec.params || Object.keys(values);
	let localized = officialSteamText(fallbackEnglish, spec.tokens || []);
	if (localized === fallbackEnglish && isSpanishLanguage()) {
		localized = SPANISH_TRANSLATIONS[key] || SPANISH_TOKEN_FALLBACKS[key] || fallbackEnglish;
	}
	return applySteamTemplateValues(localized, values, params);
}

export function steamIntlLocale(): string {
	return STEAM_LANGUAGE_TO_LOCALE[String(steamLanguageSync() || 'english').toLowerCase()] || 'en-US';
}
