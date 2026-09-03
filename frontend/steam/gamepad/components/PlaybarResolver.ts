import { backendLog } from '../../../api/backend';
import { findTopPlaybarCandidates, type PlaybarCandidate } from '../../modules/signatures/playbar';
import { gamepadCapabilities } from '../GamepadCapabilities';

class PlaybarResolver {
	private cachedCandidate: PlaybarCandidate | null = null;
	private resolved = false;

	public resolve(): React.ComponentType<any> | null {
		if (this.resolved && this.cachedCandidate?.component) {
			return this.cachedCandidate.component;
		}

		try {
			const candidates = findTopPlaybarCandidates(1);
			if (candidates.length > 0 && candidates[0].component) {
				this.cachedCandidate = candidates[0];
				this.resolved = true;
				gamepadCapabilities.setAvailable('playbar', true);
				backendLog(`[NGL][Gamepad][Playbar] Resolved native Steam playbar component from moduleId: ${this.cachedCandidate.moduleId}`);
				return this.cachedCandidate.component;
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][Playbar] Error resolving playbar component: ${error}`);
			gamepadCapabilities.recordFailure('playbar', error);
		}

		gamepadCapabilities.setAvailable('playbar', false);
		return null;
	}

	public invalidate(): void {
		this.cachedCandidate = null;
		this.resolved = false;
	}
}

export const playbarResolver = new PlaybarResolver();
