export function escapeHtml(str: string): string {
	const d = document.createElement('div');
	d.appendChild(document.createTextNode(str));
	return d.innerHTML;
}

export function escapeAttr(str: string): string {
	return escapeHtml(str).replace(/"/g, '&quot;');
}

export function stripSurroundingQuotes(value: string): string {
	let text = (value || '').trim();
	// Remove outer matching quotes (e.g. "Game", «Game», “Game”, 'Game')
	text = text.replace(/^["'«“‘]+|["'»”’]+$/g, '').trim();
	return text;
}

export function stripAccents(str: string): string {
	return (str || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

export function normalizeTitle(title: string): string {
	return stripAccents(title || '')
		.trim()
		.toLowerCase()
		.replace(/[™®©]/g, '')
		.replace(/["'«»“”‘’]/g, '')
		.replace(/[–—_:|/\\\[\](){}+-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function templateToRegex(template: string, anchored = false): RegExp | null {
	const parts = template.split('%1$s');
	if (parts.length < 2) return null;
	const escaped = parts.map(p => escapeRegex(p.trim()).replace(/\s+/g, '\\s+'));
	const body = escaped.join('\\s*(.+?)\\s*');
	return new RegExp(anchored ? `^\\s*${body}$` : body);
}
