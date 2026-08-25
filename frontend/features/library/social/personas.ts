import type { FriendPersona } from '../../../domain/types';

const personaCache = new Map<string, FriendPersona>();

export function getCachedPersona(steamId: string): FriendPersona | undefined {
	return personaCache.get(String(steamId));
}

export function hasCachedPersona(steamId: string): boolean {
	return personaCache.has(String(steamId));
}

export function cachePersona(persona: FriendPersona): void {
	if (persona?.steamid) personaCache.set(String(persona.steamid), persona);
}

export function clearPersonaCache(): void {
	personaCache.clear();
}
