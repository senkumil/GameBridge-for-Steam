import { backendLog } from '../../../api/backend';
import type { GamepadCapabilityKey } from '../GamepadCapabilities';

export interface FallbackReport {
	capability: GamepadCapabilityKey;
	reason: 'missing_component' | 'circuit_broken' | 'render_error' | 'disabled_by_flag';
	details?: string;
	timestamp: number;
}

const fallbackHistory: FallbackReport[] = [];

export function reportFallbackEngagement(
	capability: GamepadCapabilityKey,
	reason: FallbackReport['reason'],
	details?: string,
): void {
	const report: FallbackReport = {
		capability,
		reason,
		details,
		timestamp: Date.now(),
	};
	fallbackHistory.push(report);
	if (fallbackHistory.length > 50) fallbackHistory.shift();

	backendLog(`[NGL][Gamepad][Fallback] "${capability}" engaged fallback. Reason: ${reason}${details ? ` (${details})` : ''}`);
}

export function getFallbackHistory(): FallbackReport[] {
	return [...fallbackHistory];
}
