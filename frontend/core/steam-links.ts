/** Return the canonical public page for a Steam game, including delisted apps. */
export function steamGameMainPageUrl(steamAppId: string, isDelisted = false): string {
	const appId = encodeURIComponent(String(steamAppId || '').trim());
	return isDelisted
		? `https://steamdb.info/app/${appId}/`
		: `https://store.steampowered.com/app/${appId}`;
}
