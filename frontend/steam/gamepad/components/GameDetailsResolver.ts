import { backendLog } from '../../../api/backend';
import { steamWebpackRuntime } from '../../modules/SteamWebpackRuntime';
import { gamepadCapabilities } from '../GamepadCapabilities';

class GameDetailsResolver {
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
					if (typeof item === 'function' && /AppDetailsSection|GameDetailsPage|AppPageContainer/i.test(item.displayName || item.name || '')) {
						this.resolvedComponent = item;
						this.resolved = true;
						gamepadCapabilities.setAvailable('gameDetails', true);
						backendLog(`[NGL][Gamepad][GameDetails] Resolved native Steam game details component from moduleId: ${mod.id}`);
						return this.resolvedComponent;
					}
				}
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][GameDetails] Error resolving game details component: ${error}`);
			gamepadCapabilities.recordFailure('gameDetails', error);
		}

		gamepadCapabilities.setAvailable('gameDetails', false);
		return null;
	}

	public invalidate(): void {
		this.resolvedComponent = null;
		this.resolved = false;
	}
}

export const gameDetailsResolver = new GameDetailsResolver();
