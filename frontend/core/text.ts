export function escapeHtml(str: string): string {
	const d = document.createElement('div');
	d.appendChild(document.createTextNode(str));
	return d.innerHTML;
}

export function normalizeTitle(title: string): string {
	return title.trim().toLowerCase();
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
