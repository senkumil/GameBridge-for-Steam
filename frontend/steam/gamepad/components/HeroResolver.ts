import { backendLog } from '../../../api/backend';
import { findTopHeroCandidates, type HeroCandidate } from '../../modules/signatures/hero';
import { gamepadCapabilities } from '../GamepadCapabilities';

class HeroResolver {
	private cachedCandidate: HeroCandidate | null = null;
	private resolved = false;

	public resolve(): React.ComponentType<any> | null {
		if (this.resolved && this.cachedCandidate?.component) {
			return this.cachedCandidate.component;
		}

		try {
			const candidates = findTopHeroCandidates(1);
			if (candidates.length > 0 && candidates[0].component) {
				this.cachedCandidate = candidates[0];
				this.resolved = true;
				gamepadCapabilities.setAvailable('hero', true);
				backendLog(`[NGL][Gamepad][Hero] Resolved native Steam hero component from moduleId: ${this.cachedCandidate.moduleId}`);
				return this.cachedCandidate.component;
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][Hero] Error resolving hero component: ${error}`);
			gamepadCapabilities.recordFailure('hero', error);
		}

		gamepadCapabilities.setAvailable('hero', false);
		return null;
	}

	public invalidate(): void {
		this.cachedCandidate = null;
		this.resolved = false;
	}
}

export const heroResolver = new HeroResolver();
