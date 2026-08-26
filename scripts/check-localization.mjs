import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = ['frontend'];
const localizationPath = join(root, 'frontend/steam/localization.ts');
const files = [];

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path);
		else if (/\.(?:ts|tsx)$/.test(entry.name) && path !== localizationPath) files.push(path);
	}
}

for (const directory of sourceRoots) walk(join(root, directory));

const localizationSource = readFileSync(localizationPath, 'utf8');
const spanishBlock = localizationSource.slice(
	localizationSource.indexOf('export const SPANISH_TRANSLATIONS'),
	localizationSource.indexOf('export function isSpanishLanguage'),
);
const spanishKeys = new Set([...spanishBlock.matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((match) => match[1]));
const spanishWords = /[áéíóúñ¿¡]|\b(?:hoy|ayer|rechazar|vincular|recursos|identidad|añade|haz clic|listo|detectando|sin sugerencias|no se encontró|juego vinculado|detectado|la detección|la coincidencia|usar el ejecutable|completa todo|generación|para que|descargar|probar|envía|enviando|seguimiento|activar|carpeta|guardar|predeterminado|cargando|logros|muestra|juega|enlace|más|actualización|falta|oficial)\b/i;
const gdlTextCall = /gdlText\(\s*(['"])([A-Za-z0-9_]+)\1\s*,\s*(['"])([\s\S]*?)\3/g;
const violations = [];
const usedKeys = new Map();

for (const file of files) {
	const text = readFileSync(file, 'utf8');
	for (const match of text.matchAll(gdlTextCall)) {
		const [, , key, , fallback] = match;
		const line = text.slice(0, match.index).split('\n').length;
		if (spanishWords.test(fallback)) {
			violations.push(`${relative(root, file)}:${line}: gdlText('${key}', ...) must use an English fallback.`);
		}
		if (!usedKeys.has(key)) usedKeys.set(key, `${relative(root, file)}:${line}`);
	}
}

for (const [key, location] of usedKeys) {
	if (!spanishKeys.has(key)) {
		violations.push(`${location}: '${key}' is used by gdlText but has no SPANISH_TRANSLATIONS entry.`);
	}
}

if (violations.length) {
	console.error('Localization check failed:\n' + violations.join('\n'));
	process.exit(1);
}

console.log(`Localization check passed (${files.length} files, ${usedKeys.size} gdlText keys).`);
