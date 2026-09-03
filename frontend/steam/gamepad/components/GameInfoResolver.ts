import { backendLog } from '../../../api/backend';
import { findTopGameInfoCandidates, type GameInfoCandidate } from '../../modules/signatures/gameInfo';
import { gamepadCapabilities } from '../GamepadCapabilities';

class GameInfoResolver {
	private cachedCandidate: GameInfoCandidate | null = null;
	private resolved = false;

	public resolve(): React.ComponentType<any> | null {
		if (this.resolved && this.cachedCandidate?.component) {
			return this.cachedCandidate.component;
		}

		try {
			const candidates = findTopGameInfoCandidates(1);
			if (candidates.length > 0 && candidates[0].component) {
				this.cachedCandidate = candidates[0];
				this.resolved = true;
				gamepadCapabilities.setAvailable('gameInfo', true);
				backendLog(`[NGL][Gamepad][GameInfo] Resolved native Steam game info component from moduleId: ${this.cachedCandidate.moduleId}`);
				return this.cachedCandidate.component;
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][GameInfo] Error resolving game info component: ${error}`);
			gamepadCapabilities.recordFailure('gameInfo', error);
		}

		gamepadCapabilities.setAvailable('gameInfo', false);
		return null;
	}

	public invalidate(): void {
		this.cachedCandidate = null;
		this.resolved = false;
	}
}

export const gameInfoResolver = new GameInfoResolver();
