export function injectAchievementStyle(doc: Document, id: string, cssText: string): void {
	if (doc.getElementById(id)) return;
	const style = doc.createElement('style');
	style.id = id;
	style.textContent = cssText;
	(doc.head || doc.documentElement).appendChild(style);
}
