import type { FriendPersona } from '../../../domain/types';

const personaCache = new Map<string, FriendPersona>();
const MAX_PERSONA_CACHE_ENTRIES = 128;

export function getCachedPersona(steamId: string): FriendPersona | undefined {
	const key = String(steamId || '').trim();
	if (!key || key === '0') return undefined;
	const existing = personaCache.get(key);
	if (existing && (existing.name || existing.avatar)) return existing;

	try {
		const win = window as any;
		const scFriends = win.SteamClient?.Friends || win.parent?.SteamClient?.Friends || win.top?.SteamClient?.Friends;
		let name = '';
		let avatar = '';
		if (typeof scFriends?.GetFriendPersonaName === 'function') {
			name = scFriends.GetFriendPersonaName(key) || '';
		}
		if (typeof scFriends?.GetFriendAvatarURL === 'function') {
			avatar = scFriends.GetFriendAvatarURL(key) || '';
		}

		if (!name || !avatar) {
			const store = win.personaStore || win.friendsStore || win.userStore || win.parent?.personaStore || win.parent?.friendsStore;
			const p = store?.GetPersona?.(key) || store?.GetFriend?.(key) || store?.m_mapPersona?.get?.(key);
			if (p) {
				if (!name) name = p.m_strPlayerName || p.strPlayerName || p.name || p.m_strPersonaName || '';
				if (!avatar) avatar = p.m_strAvatarURL || p.strAvatarURL || p.avatar || p.m_strAvatarHash || '';
			}
		}

		if (name || avatar) {
			const persona: FriendPersona = { steamid: key, name: name || key, avatar: avatar || '' };
			personaCache.set(key, persona);
			return persona;
		}
	} catch {}

	return existing;
}

export function hasCachedPersona(steamId: string): boolean {
	const persona = getCachedPersona(steamId);
	return Boolean(persona && (persona.name || persona.avatar));
}

export function cachePersona(persona: FriendPersona): void {
	if (!persona?.steamid) return;
	const key = String(persona.steamid);
	personaCache.delete(key);
	personaCache.set(key, persona);
	while (personaCache.size > MAX_PERSONA_CACHE_ENTRIES) {
		const oldest = personaCache.keys().next().value as string | undefined;
		if (!oldest) break;
		personaCache.delete(oldest);
	}
}

export function clearPersonaCache(): void {
	personaCache.clear();
}
