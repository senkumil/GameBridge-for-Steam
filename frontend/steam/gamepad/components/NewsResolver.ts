import { backendLog } from '../../../api/backend';
import { findTopNewsCandidates, type NewsCandidate } from '../../modules/signatures/news';
import { gamepadCapabilities } from '../GamepadCapabilities';

class NewsResolver {
	private cachedCandidate: NewsCandidate | null = null;
	private resolved = false;

	public resolve(): React.ComponentType<any> | null {
		if (this.resolved && this.cachedCandidate?.component) {
			return this.cachedCandidate.component;
		}

		try {
			const candidates = findTopNewsCandidates(1);
			if (candidates.length > 0 && candidates[0].component) {
				this.cachedCandidate = candidates[0];
				this.resolved = true;
				gamepadCapabilities.setAvailable('news', true);
				backendLog(`[NGL][Gamepad][News] Resolved native Steam news component from moduleId: ${this.cachedCandidate.moduleId}`);
				return this.cachedCandidate.component;
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][News] Error resolving news component: ${error}`);
			gamepadCapabilities.recordFailure('news', error);
		}

		gamepadCapabilities.setAvailable('news', false);
		return null;
	}

	public invalidate(): void {
		this.cachedCandidate = null;
		this.resolved = false;
	}
}

export const newsResolver = new NewsResolver();
