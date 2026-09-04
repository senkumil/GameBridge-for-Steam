import { backendLog } from '../../../api/backend';
import { steamWebpackRuntime } from '../../modules/SteamWebpackRuntime';
import { gamepadCapabilities } from '../GamepadCapabilities';

class FriendsResolver {
	private resolvedComponent: any = null;
	private resolved = false;

	public resolve(): React.ComponentType<any> | null {
		if (this.resolved && this.resolvedComponent) {
			return this.resolvedComponent;
		}

		try {
			const modules = steamWebpackRuntime.getAllModules();
			for (const mod of modules) {
				const exp = mod.exports;
				if (!exp) continue;
				const candidates = typeof exp === 'function' ? [exp] : typeof exp === 'object' ? Object.values(exp) : [];
				for (const item of candidates) {
					if (typeof item === 'function' && /FriendsWhoPlay|FriendActivityRow|FriendsSection/i.test(item.displayName || item.name || '')) {
						this.resolvedComponent = item;
						this.resolved = true;
						gamepadCapabilities.setAvailable('friends', true);
						backendLog(`[NGL][Gamepad][Friends] Resolved native Steam friends component from moduleId: ${mod.id}`);
						return this.resolvedComponent;
					}
				}
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][Friends] Error resolving friends component: ${error}`);
			gamepadCapabilities.recordFailure('friends', error);
		}

		gamepadCapabilities.setAvailable('friends', false);
		return null;
	}

	public invalidate(): void {
		this.resolvedComponent = null;
		this.resolved = false;
	}
}

export const friendsResolver = new FriendsResolver();
