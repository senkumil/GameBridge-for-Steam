import type { FriendPersona } from '../../../domain/types';

const personaCache = new Map<string, FriendPersona>();
const MAX_PERSONA_CACHE_ENTRIES = 128;

export function getCachedPersona(steamId: string): FriendPersona | undefined {
	return personaCache.get(String(steamId));
}

export function hasCachedPersona(steamId: string): boolean {
	return personaCache.has(String(steamId));
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
