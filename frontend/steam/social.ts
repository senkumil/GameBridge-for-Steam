import { findModuleExport } from '@steambrew/client';
import { backendLog } from '../api/backend';

let protoMessageCache: Map<string, any> | null = null;
let messageWrapper: any = null;
let playerService: any = null;

function findProtoMessageClass(className: string): any {
	if (!protoMessageCache) protoMessageCache = new Map();
	if (protoMessageCache.has(className)) return protoMessageCache.get(className);
	let found: any = null;
	try {
		found = findModuleExport((candidate: any) => {
			try {
				return typeof candidate === 'function'
					&& typeof candidate.deserializeBinary === 'function'
					&& typeof candidate.prototype?.getClassName === 'function'
					&& new candidate().getClassName() === className;
			} catch { return false; }
		});
	} catch {}
	protoMessageCache.set(className, found);
	return found;
}

/** Post a game-scoped status through the same PlayerService used by Steam's native activity entry. */
export async function postStatusUpdate(appId: number, text: string): Promise<boolean> {
	try {
		if (!messageWrapper) {
			messageWrapper = findModuleExport((candidate: any) =>
				typeof candidate?.Init === 'function'
				&& typeof candidate?.InitFromPacket === 'function'
				&& typeof candidate?.InitFromObject === 'function');
		}
		if (!playerService) playerService = findModuleExport((candidate: any) => typeof candidate?.PostStatusToFriends === 'function');
		const MessageClass = findProtoMessageClass('CPlayer_PostStatusToFriends_Request');
		const transport = (window as any).appAchievementProgressCache?.m_CMInterface?.GetServiceTransport?.()
			|| (window as any).CMInterface?.GetServiceTransport?.()
			|| (window as any).SteamClient?.Stats?.GetServiceTransport?.()
			|| (window as any).appActivityStore?.m_CMInterface?.GetServiceTransport?.()
			|| (findModuleExport((candidate: any) => typeof candidate?.GetServiceTransport === 'function') as any)?.GetServiceTransport?.();
		if (!messageWrapper || !playerService || !MessageClass || !transport) {
			backendLog(`Post status: missing Steam internals (wrapper=${!!messageWrapper} service=${!!playerService} msg=${!!MessageClass} transport=${!!transport})`);
			return false;
		}
		const message = messageWrapper.Init(MessageClass);
		message.Body().set_appid(appId);
		message.Body().set_status_text(text);
		const response = await playerService.PostStatusToFriends(transport, message);
		const result = response?.GetEResult?.();
		backendLog('PostStatusToFriends result: ' + result);
		return result === undefined || result === 1;
	} catch (error) {
		backendLog('Post status error: ' + error);
		return false;
	}
}

export async function deleteStatusPostOnSteam(postId: string): Promise<boolean> {
	try {
		const protoDelete = findProtoMessageClass('CPlayer_DeleteStatus_Request')
			|| findProtoMessageClass('CPlayer_DeletePost_Request')
			|| findProtoMessageClass('CCommunity_DeletePost_Request');
		if (protoDelete && playerService && messageWrapper) {
			const transport = (window as any).appAchievementProgressCache?.m_CMInterface?.GetServiceTransport?.()
				|| (window as any).CMInterface?.GetServiceTransport?.()
				|| (window as any).SteamClient?.Stats?.GetServiceTransport?.()
				|| (window as any).appActivityStore?.m_CMInterface?.GetServiceTransport?.();
			if (transport) {
				const message = messageWrapper.Init(protoDelete);
				if (typeof message.Body().set_post_id === 'function') message.Body().set_post_id(postId);
				if (typeof message.Body().set_postid === 'function') message.Body().set_postid(postId);
				if (typeof playerService.DeleteStatus === 'function') {
					await playerService.DeleteStatus(transport, message);
					return true;
				}
				if (typeof playerService.DeletePost === 'function') {
					await playerService.DeletePost(transport, message);
					return true;
				}
			}
		}
	} catch (e) {
		backendLog('deleteStatusPostOnSteam RPC error: ' + e);
	}
	return false;
}

export function clearSteamSocialCaches(): void {
	protoMessageCache?.clear();
	protoMessageCache = null;
	messageWrapper = null;
	playerService = null;
}
