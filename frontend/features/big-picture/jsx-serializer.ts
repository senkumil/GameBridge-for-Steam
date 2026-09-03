import React from 'react';
import { escapeAttr, escapeHtml } from '../../core/text';

const VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export function renderJsxToHtml(node: React.ReactNode): string {
	if (node === null || node === undefined || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number') return escapeHtml(String(node));
	if (Array.isArray(node)) return node.map(renderJsxToHtml).join('');

	if (React.isValidElement(node)) {
		const { type, props } = node;
		if (type === React.Fragment) {
			return renderJsxToHtml((props as any)?.children);
		}
		if (typeof type === 'function') {
			try {
				return renderJsxToHtml((type as any)(props));
			} catch {
				return '';
			}
		}
		if (typeof type === 'string') {
			let attrs = '';
			let innerHtml: string | null = null;

			if (props) {
				for (const [key, val] of Object.entries(props as Record<string, any>)) {
					if (key === 'children') continue;
					if (key === 'dangerouslySetInnerHTML' && val && typeof val.__html === 'string') {
						innerHtml = val.__html;
						continue;
					}
					if (val === false || val === null || val === undefined) continue;

					const attrName = key === 'className' ? 'class'
						: key === 'htmlFor' ? 'for'
						: key.replace(/([A-Z])/g, '-$1').toLowerCase();

					if (val === true) {
						attrs += ` ${attrName}`;
					} else {
						attrs += ` ${attrName}="${escapeAttr(String(val))}"`;
					}
				}
			}

			if (VOID_ELEMENTS.has(type.toLowerCase())) {
				return `<${type}${attrs} />`;
			}

			const content = innerHtml !== null ? innerHtml : renderJsxToHtml((props as any)?.children);
			return `<${type}${attrs}>${content}</${type}>`;
		}
	}
	return '';
}
