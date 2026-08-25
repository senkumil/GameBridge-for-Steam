import type { NativeGameInfo, SteamGameData } from '../../domain/types';
import type { SteamLibraryAssets } from './artwork';
import { backendLog } from '../../api/backend';
import { ensureCloudStatus, removeCloudStatus } from './cloud-status';
import { clearNativeInfoSessionState, ensureNativeInfoButton, ensureNativeInfoPanel, removeNativeInfoButton, removeNativeInfoPanel } from './info-panel';
import { steamNativeGameInfo as buildSteamNativeGameInfo } from './native-game-model';
import { ensureNativeGameInfoStyles } from './styles';

let currentNativeGameInfo: NativeGameInfo | null = null;

/**
 * Build the language-independent semantic model used by Steam-native library chrome.
 * Kept as a re-export here so callers do not need to know the internal module split.
 */
export function steamNativeGameInfo(data: SteamGameData, steamAppId: string, modern?: SteamLibraryAssets | null): NativeGameInfo {
	return buildSteamNativeGameInfo(data, steamAppId, modern);
}

/**
 * Coordinate the small pieces that augment Steam's existing play bar and game-info area.
 * This module intentionally contains no markup or CSS; each surface owns its own implementation.
 */
export function ensureNativeGameChrome(doc: Document, model: NativeGameInfo): void {
	currentNativeGameInfo = model;
	ensureNativeGameInfoStyles(doc);

	try {
		if (model.hasCloud) ensureCloudStatus(doc);
		else removeCloudStatus(doc);
	} catch (error) {
		backendLog('Cloud status injection error: ' + error);
	}

	try { ensureNativeInfoPanel(doc, model); }
	catch (error) { backendLog('Game info panel injection error: ' + error); }

	try { ensureNativeInfoButton(doc, model); }
	catch (error) { backendLog('Game info button injection error: ' + error); }
}

export function removeNativeGameChrome(doc: Document, clearModel = false): void {
	removeCloudStatus(doc);
	removeNativeInfoButton(doc);
	removeNativeInfoPanel(doc);
	doc.querySelectorAll('[data-gdl-playbar-achievements="1"], #gdl-playbar-achievements').forEach(element => element.remove());
	if (clearModel) {
		currentNativeGameInfo = null;
		clearNativeInfoSessionState();
	}
}

export function getCurrentNativeGameInfo(): NativeGameInfo | null {
	return currentNativeGameInfo;
}
