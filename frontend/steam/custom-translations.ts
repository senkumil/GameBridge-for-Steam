import { LATIN_TRANSLATIONS } from './translations-latin';
import { ASIAN_TRANSLATIONS } from './translations-asian';
import { SLAVIC_TRANSLATIONS } from './translations-slavic';

export const OTHER_LANGUAGE_TRANSLATIONS: Record<string, Record<string, string>> = {
	...LATIN_TRANSLATIONS,
	...ASIAN_TRANSLATIONS,
	...SLAVIC_TRANSLATIONS,
};
