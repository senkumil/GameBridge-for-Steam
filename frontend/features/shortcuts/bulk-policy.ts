import type { ShortcutDetectionCandidate, ShortcutDetectionContext } from '../../domain/types';

export interface BulkEvaluationResult {
	candidate: ShortcutDetectionCandidate | null;
	safe: boolean;
	reason: string;
}

/**
 * Bulk-link policy requested by the user: maximize recall and always choose the
 * highest-scoring game candidate once it reaches the minimum percentage.
 *
 * Important semantics:
 * - The detector/ranker is responsible for ordering candidates.
 * - Bulk does NOT require extra corroboration, confidence tier, validation_state,
 *   runner-up margin, alias confirmation, year/remake proof, or remembered AppID.
 * - Non-game results and malformed AppIDs are ignored before ranking.
 * - Ties are stable: the first candidate returned by the detector wins.
 */
export const BULK_TOP_SCORE_THRESHOLD = 58;

export function evaluateBulkCandidate(
	_context: ShortcutDetectionContext,
	candidates: ShortcutDetectionCandidate[],
	_rememberedAppId = '',
): BulkEvaluationResult {
	if (!Array.isArray(candidates) || candidates.length === 0) {
		return { candidate: null, safe: false, reason: 'no_candidates' };
	}

	const eligible = candidates
		.map((candidate, index) => ({ candidate, index, score: Number(candidate?.score) }))
		.filter(({ candidate, score }) => {
			if (!candidate || !/^\d+$/.test(String(candidate.appid || ''))) return false;
			if (!Number.isFinite(score)) return false;
			const reasons = candidate.reasons || [];
			const negativeReasons = candidate.negative_reasons || [];
			return !reasons.includes('non_game_result') && !negativeReasons.includes('non_game_result');
		})
		.sort((left, right) => (right.score - left.score) || (left.index - right.index));

	if (eligible.length === 0) {
		return { candidate: null, safe: false, reason: 'no_game_candidates' };
	}

	const top = eligible[0];
	if (top.score < BULK_TOP_SCORE_THRESHOLD) {
		return { candidate: null, safe: false, reason: 'below_bulk_score_threshold' };
	}

	return { candidate: top.candidate, safe: true, reason: 'top_score_threshold' };
}
