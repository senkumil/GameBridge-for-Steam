import React from 'react';
import { findModuleExport, toaster } from '@steambrew/client';
import type { LocalAchievementData, LocalAchievementItem } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getLocalAchievementGameInfo, clearLocalAchievementGameInfoCache } from './game-info';
import { gdlText } from '../../steam/localization';

interface LocalAchievementToastBaseline {
	version: 1;
	observed_at: number;
	earned: string[];
}

interface QueuedLocalAchievementToast {
	appid: string;
	achievement: LocalAchievementItem;
}

export type NativeAchievementToastWindowKind = 'overlay' | 'bigpicture' | 'desktop';

interface NativeAchievementToastWindow {
	window: Window;
	kind: NativeAchievementToastWindowKind;
	label: string;
}

const LOCAL_ACHIEVEMENT_TOAST_STATE_PREFIX = 'gdl:achievement-toast:v1:';
const STEAM_ACHIEVEMENT_NOTIFICATION_TYPE = 5;
const STEAM_ACHIEVEMENT_TOAST_GAP_MS = 5500;
const localAchievementToastBaselines = new Map<string, { observedAt: number; earned: Set<string> }>();
const localAchievementToastQueue: QueuedLocalAchievementToast[] = [];
const nativeAchievementToastWindows = new Map<Window, NativeAchievementToastWindow>();
let localAchievementToastTimer: ReturnType<typeof setTimeout> | null = null;
let nativeAchievementNotificationProto: any = null;

export function registerNativeAchievementToastWindow(
	popupWin: Window,
	kind: NativeAchievementToastWindowKind,
	label: string,
): void {
	nativeAchievementToastWindows.set(popupWin, { window: popupWin, kind, label });
}

function getNativeAchievementToastWindows(): NativeAchievementToastWindow[] {
	const priority: Record<NativeAchievementToastWindowKind, number> = {
		overlay: 3,
		bigpicture: 2,
		desktop: 1,
	};
	const targets: NativeAchievementToastWindow[] = [];
	for (const [popupWin, target] of nativeAchievementToastWindows) {
		if (popupWin.closed) {
			nativeAchievementToastWindows.delete(popupWin);
			continue;
		}
		targets.push(target);
	}
	if (!targets.some(target => target.window === window)) {
		targets.push({ window, kind: 'desktop', label: 'plugin window' });
	}
	return targets.sort((a, b) => priority[b.kind] - priority[a.kind]);
}

function localAchievementToastStateKey(data: LocalAchievementData): string {
	const metadataAppId = String(data.metadata_appid || data.appid || '');
	const stateAppId = String(data.state_appid || metadataAppId);
	return `${LOCAL_ACHIEVEMENT_TOAST_STATE_PREFIX}${metadataAppId}:${stateAppId}`;
}

function persistLocalAchievementToastBaseline(key: string, baseline: { observedAt: number; earned: Set<string> }): void {
	try {
		const payload: LocalAchievementToastBaseline = {
			version: 1,
			observed_at: baseline.observedAt,
			earned: Array.from(baseline.earned),
		};
		localStorage.setItem(key, JSON.stringify(payload));
	} catch {}
}

/**
 * Return only genuine locked -> unlocked transitions. The initial state is
 * persisted silently so installing/reloading the plugin cannot replay old unlocks.
 */
function detectNewLocalAchievementUnlocks(data: LocalAchievementData): LocalAchievementItem[] {
	const key = localAchievementToastStateKey(data);
	const now = Math.floor(Date.now() / 1000);
	let baseline = localAchievementToastBaselines.get(key) || null;
	if (!baseline) {
		try {
			const raw = localStorage.getItem(key);
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<LocalAchievementToastBaseline>;
				if (parsed.version === 1 && Array.isArray(parsed.earned)) {
					baseline = {
						observedAt: Number(parsed.observed_at || 0),
						earned: new Set(parsed.earned.map(String)),
					};
				}
			}
		} catch {}
	}

	const currentlyEarned = data.achievements.filter(achievement => achievement.earned);
	if (!baseline) {
		baseline = { observedAt: now, earned: new Set(currentlyEarned.map(achievement => String(achievement.name))) };
		localAchievementToastBaselines.set(key, baseline);
		persistLocalAchievementToastBaseline(key, baseline);
		backendLog(`Achievement notification baseline created for ${data.appid}: ${baseline.earned.size} already unlocked`);
		return [];
	}

	const newlyUnlocked = currentlyEarned.filter(achievement => {
		if (baseline!.earned.has(String(achievement.name))) return false;
		return !achievement.earned_time || !baseline!.observedAt || achievement.earned_time >= baseline!.observedAt - 10;
	});
	for (const achievement of currentlyEarned) baseline.earned.add(String(achievement.name));
	baseline.observedAt = now;
	localAchievementToastBaselines.set(key, baseline);
	persistLocalAchievementToastBaseline(key, baseline);
	return newlyUnlocked;
}

function getNativeAchievementNotificationProto(): any | null {
	if (nativeAchievementNotificationProto) return nativeAchievementNotificationProto;
	try {
		nativeAchievementNotificationProto = findModuleExport((candidate: any) => {
			if (typeof candidate?.fromObject !== 'function' || typeof candidate?.prototype?.getClassName !== 'function') return false;
			try {
				return candidate.prototype.getClassName.call(candidate.prototype) === 'CClientNotificationAchievement';
			} catch {
				return candidate.prototype.getClassName.toString().includes('CClientNotificationAchievement');
			}
		});
	} catch (error) {
		backendLog('Native achievement notification protobuf lookup failed: ' + String(error));
	}
	return nativeAchievementNotificationProto || null;
}

function showNativeAchievementToast(appid: string, achievement: LocalAchievementItem): boolean {
	try {
		const proto = getNativeAchievementNotificationProto();
		if (!proto?.fromObject) return false;
		const message = proto.fromObject({
			achievement_id: String(achievement.name || ''),
			appid: Number(appid),
			name: String(achievement.display_name || achievement.name || ''),
			description: String(achievement.description || ''),
			image_url: String(achievement.icon || achievement.icon_gray || ''),
			achieved: true,
			rtime_unlocked: Number(achievement.earned_time || Math.floor(Date.now() / 1000)),
			min_progress: 0,
			current_progress: Number(achievement.progress || achievement.max_progress || 0),
			max_progress: Number(achievement.max_progress || 0),
			global_achieved_pct: Number(achievement.global_percent || 0),
		});
		const binary = message?.serializeBinary?.();
		if (!binary) return false;
		for (const target of getNativeAchievementToastWindows()) {
			const store = (target.window as any).NotificationStore;
			if (!store?.OnNotification) continue;
			let notificationId = Number(store.m_nNextTestNotificationID);
			if (!Number.isFinite(notificationId)) notificationId = Math.floor(Date.now() % 2000000000);
			else store.m_nNextTestNotificationID = notificationId + 1;
			store.OnNotification(notificationId, STEAM_ACHIEVEMENT_NOTIFICATION_TYPE, binary);
			backendLog(`Native achievement target: ${target.kind} (${target.label})`);
			return true;
		}
		return false;
	} catch (error) {
		backendLog('Native achievement toast failed: ' + String(error));
		return false;
	}
}

function playAchievementSound(): void {
	try {
		const steamClient = (window as any).SteamClient;
		if (typeof steamClient?.Sounds?.PlaySound === 'function') {
			steamClient.Sounds.PlaySound(5);
			return;
		}
		if (typeof steamClient?.Sounds?.PlayNavSound === 'function') {
			steamClient.Sounds.PlayNavSound(5);
			return;
		}
		if (typeof steamClient?.Sounds?.PlaySoundEffect === 'function') {
			steamClient.Sounds.PlaySoundEffect(5);
			return;
		}
	} catch {}
}

export async function showAchievementToast(appid: string, achievement: LocalAchievementItem): Promise<void> {
	if (showNativeAchievementToast(appid, achievement)) {
		backendLog(`Native achievement notification shown: ${appid}/${achievement.name}`);
		return;
	}
	playAchievementSound();

	const info = await getLocalAchievementGameInfo(appid);
	const logo = achievement.icon
		? React.createElement('img', {
			src: achievement.icon,
			style: { width: '100%', height: '100%', objectFit: 'cover' },
		})
		: undefined;
	toaster.toast({
		title: gdlText('achievement_unlocked_toast', 'Achievement unlocked'),
		body: achievement.display_name || achievement.name,
		subtext: info.name,
		logo,
		eType: STEAM_ACHIEVEMENT_NOTIFICATION_TYPE,
		sound: 5,
		playSound: true,
		showToast: true,
		duration: 5000,
	});
	backendLog(`Fallback achievement notification shown: ${appid}/${achievement.name}`);
}

function drainLocalAchievementToastQueue(): void {
	if (localAchievementToastTimer || localAchievementToastQueue.length === 0) return;
	const next = localAchievementToastQueue.shift()!;
	void showAchievementToast(next.appid, next.achievement).catch(error => backendLog('Achievement toast error: ' + String(error)));
	localAchievementToastTimer = setTimeout(() => {
		localAchievementToastTimer = null;
		drainLocalAchievementToastQueue();
	}, STEAM_ACHIEVEMENT_TOAST_GAP_MS);
}

export function enqueueLocalAchievementToasts(data: LocalAchievementData): void {
	const unlocked = detectNewLocalAchievementUnlocks(data);
	for (const achievement of unlocked) {
		localAchievementToastQueue.push({ appid: String(data.metadata_appid || data.appid), achievement });
	}
	if (unlocked.length > 0) {
		backendLog(`Queued ${unlocked.length} new achievement notification(s) for ${data.appid}`);
		drainLocalAchievementToastQueue();
	}
}

export function disposeAchievementNotifications(): void {
	if (localAchievementToastTimer) {
		clearTimeout(localAchievementToastTimer);
		localAchievementToastTimer = null;
	}
	localAchievementToastQueue.length = 0;
	nativeAchievementToastWindows.clear();
	localAchievementToastBaselines.clear();
	clearLocalAchievementGameInfoCache();
	nativeAchievementNotificationProto = null;
}
