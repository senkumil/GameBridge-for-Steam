export function injectLibraryStyle(doc: Document, id: string, cssText: string): void {
	const existing = doc.getElementById(id);
	if (existing?.tagName === 'STYLE') {
		if (existing.textContent !== cssText) existing.textContent = cssText;
		return;
	}
	const style = doc.createElement('style');
	style.id = id;
	style.textContent = cssText;
	(doc.head || doc.documentElement).appendChild(style);
}
