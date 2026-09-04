import { backendLog } from '../../../api/backend';
import { findTopAchievementCandidates, findTopAchievementSectionCandidates, type AchievementCandidate } from '../../modules/signatures/achievements';
import { gamepadCapabilities } from '../GamepadCapabilities';

class AchievementsResolver {
	private cachedCandidate: AchievementCandidate | null = null;
	private cachedSectionCandidate: AchievementCandidate | null = null;
	private resolved = false;

	public resolve(): React.ComponentType<any> | null {
		if (this.resolved && this.cachedCandidate?.component) {
			return this.cachedCandidate.component;
		}

		try {
			const candidates = findTopAchievementCandidates(1);
			if (candidates.length > 0 && candidates[0].component) {
				this.cachedCandidate = candidates[0];
				this.resolved = true;
				gamepadCapabilities.setAvailable('achievements', true);
				backendLog(`[NGL][Gamepad][Achievements] Resolved native Steam achievement item component from moduleId: ${this.cachedCandidate.moduleId}`);
				return this.cachedCandidate.component;
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][Achievements] Error resolving achievement item component: ${error}`);
			gamepadCapabilities.recordFailure('achievements', error);
		}

		gamepadCapabilities.setAvailable('achievements', false);
		return null;
	}

	public resolveSection(): React.ComponentType<any> | null {
		if (this.cachedSectionCandidate?.component) {
			return this.cachedSectionCandidate.component;
		}

		try {
			const candidates = findTopAchievementSectionCandidates(1);
			if (candidates.length > 0 && candidates[0].component) {
				this.cachedSectionCandidate = candidates[0];
				backendLog(`[NGL][Gamepad][Achievements] Resolved native Steam achievement section component from moduleId: ${this.cachedSectionCandidate.moduleId}`);
				return this.cachedSectionCandidate.component;
			}
		} catch (error) {
			backendLog(`[NGL][Gamepad][Achievements] Error resolving achievement section component: ${error}`);
		}
		return null;
	}

	public getCandidateInfo(): AchievementCandidate | null {
		return this.cachedCandidate;
	}

	public invalidate(): void {
		this.cachedCandidate = null;
		this.cachedSectionCandidate = null;
		this.resolved = false;
	}
}

export const achievementsResolver = new AchievementsResolver();
