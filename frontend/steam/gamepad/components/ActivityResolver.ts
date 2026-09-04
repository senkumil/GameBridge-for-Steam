import { backendLog } from '../../../api/backend';
import { findTopActivityCandidates, type ActivityCandidate } from '../../modules/signatures/activity';
import { gamepadCapabilities } from '../GamepadCapabilities';

class ActivityResolver {
	private cachedCandidate: ActivityCandidate | null = null;
	private resolved = false;

	public resolve(): React.ComponentType<any> | null {
		if (this.resolved && this.cachedCandidate?.component) {
			return this.cachedCandidate.component;
		}

		try {
			const candidates = findTopActivityCandidates(1);
			if (candidates.length > 0 && candidates[0].component) {
				this.cachedCandidate = candidates[0];
				this.resolved = true;
				gamepadCapabilities.setAvailable('activity', true);
				backendLog(`[NGL][Gamepad][Activity] Resolved native Steam activity component from moduleId: ${this.cachedCandidate.moduleId}`);
				return this.cachedCandidate.component;
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][Activity] Error resolving activity component: ${error}`);
			gamepadCapabilities.recordFailure('activity', error);
		}

		gamepadCapabilities.setAvailable('activity', false);
		return null;
	}

	public invalidate(): void {
		this.cachedCandidate = null;
		this.resolved = false;
	}
}

export const activityResolver = new ActivityResolver();
