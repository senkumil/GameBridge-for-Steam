import type { ShortcutDetectionCandidate, ShortcutDetectionContext } from '../../domain/types';

export interface BulkEvaluationResult {
	candidate: ShortcutDetectionCandidate | null;
	safe: boolean;
	reason: string;
}

/**
 * Evaluates whether a detected candidate is safe for unattended automated linking.
 * In Bulk linking: PRECISION > RECALL.
 * Ambiguous, uncorroborated, or colliding candidates are safely SKIPPED.
 */
export function evaluateBulkCandidate(
	_context: ShortcutDetectionContext,
	candidates: ShortcutDetectionCandidate[],
	rememberedAppId = '',
): BulkEvaluationResult {
	if (!Array.isArray(candidates) || candidates.length === 0) {
		return { candidate: null, safe: false, reason: 'no_candidates' };
	}

	const top = candidates[0];
	if (!top || (top.reasons || []).includes('non_game_result') || (top.negative_reasons || []).includes('non_game_result')) {
		return { candidate: null, safe: false, reason: 'non_game_result' };
	}

	// Evaluate remembered AppID strictly as a non-authoritative tie-breaker.
	// It MUST NOT override a fresh candidate with clearly superior evidence.
	let candidateToEvaluate = top;
	if (rememberedAppId && /^\d+$/.test(rememberedAppId)) {
		const remembered = candidates.find(c => c.appid === rememberedAppId);
		if (remembered && remembered.appid !== top.appid) {
			const rememberedReasons = new Set(remembered.reasons || []);
			const rememberedNeg = new Set(remembered.negative_reasons || []);
			const topReasons = new Set(top.reasons || []);
			const topHasProof = Boolean(top.direct || top.executable_match || topReasons.has('official_executable_match'));
			const rememberedHasProof = Boolean(remembered.direct || remembered.executable_match || rememberedReasons.has('official_executable_match'));

			// If top candidate has proof and remembered does not, top clearly wins
			if (topHasProof && !rememberedHasProof) {
				candidateToEvaluate = top;
			} else if (rememberedNeg.size > 0 || remembered.score < 70) {
				// Remembered candidate has negative contradictions or is too weak
				candidateToEvaluate = top;
			} else if (top.score - remembered.score < 10) {
				// Score margin is small (tie-break scenario) and remembered candidate is clean
				candidateToEvaluate = remembered;
			} else {
				// Top candidate is significantly stronger
				candidateToEvaluate = top;
			}
		}
	}

	const candidate = candidateToEvaluate;
	const second = candidates.find(c => c.appid !== candidate.appid);
	const margin = second ? candidate.score - second.score : candidate.score;
	const reasons = new Set((candidate.reasons || []).map(String));
	const negReasons = new Set((candidate.negative_reasons || []).map(String));
	const isCollision = candidate.identity_collision === true;

	// 1. Disqualify if there are direct contradictions
	if (negReasons.has('sequel_mismatch') || negReasons.has('year_mismatch') || negReasons.has('remake_mismatch') || negReasons.has('non_game_result')) {
		return { candidate: null, safe: false, reason: 'contradictory_evidence' };
	}

	// 2. Disqualify if there is an unresolved identity collision (same base title, different versions)
	if (isCollision) {
		const hasDifferentiatingEvidence = (reasons.has('year_match') && !negReasons.has('year_mismatch'))
			|| (reasons.has('pe_product_exact') && !negReasons.has('remake_mismatch'));
		if (!hasDifferentiatingEvidence || margin < 14) {
			return { candidate: null, safe: false, reason: 'unresolved_identity_collision' };
		}
	}

	// 3. Disqualify if relying solely on steam_appid.txt without corroboration
	if (reasons.has('steam_appid_file') && !candidate.executable_match && !reasons.has('official_executable_match') && !reasons.has('official_title_exact') && !reasons.has('pe_product_exact')) {
		return { candidate: null, safe: false, reason: 'unverified_steam_appid_file' };
	}

	// 4. Disqualify if relying solely on folder match without title or exe match
	if (reasons.has('folder_exact') && !candidate.executable_match && !reasons.has('official_executable_match') && !reasons.has('official_title_exact') && !reasons.has('pe_product_exact')) {
		return { candidate: null, safe: false, reason: 'folder_only_insufficient' };
	}

	// 5. Disqualify if relying solely on unverified alias
	if (reasons.has('alias_requires_confirmation')
		|| (reasons.has('franchise_alias') && !candidate.executable_match && !reasons.has('official_executable_match') && !reasons.has('pe_product_exact') && !reasons.has('official_title_exact'))) {
		return { candidate: null, safe: false, reason: 'unverified_alias' };
	}

	// 6. Disqualify if relying solely on generic executable name
	if (reasons.has('generic_executable')) {
		return { candidate: null, safe: false, reason: 'generic_executable_insufficient' };
	}

	// Ambiguity check: if there is a close runner-up (margin < 12) with high score
	if (second && margin < 12 && second.score >= 70 && !(second.reasons || []).includes('non_game_result')) {
		return { candidate: null, safe: false, reason: 'ambiguous_close_runner_up' };
	}

	// Tier A: PROOF (Direct launch argument, exact appmanifest, or official signed Steam launch executable)
	const hasProof = Boolean(candidate.direct || candidate.executable_match || reasons.has('official_executable_match'));
	if (hasProof && candidate.score >= 80) {
		return { candidate, safe: true, reason: 'proof_official_match' };
	}

	// Tier B: STRONG MULTI-SIGNAL WITH SAFE MARGIN
	if (candidate.score >= 88 && margin >= 14) {
		const hasStrongCorroboration = reasons.has('official_title_exact')
			|| (reasons.has('title_exact') && (reasons.has('pe_product_exact') || reasons.has('year_match') || reasons.has('folder_exact')));
		if (hasStrongCorroboration) {
			return { candidate, safe: true, reason: 'strong_corroborated_match' };
		}
	}

	// Default: Insufficient confidence for automated linking
	return { candidate: null, safe: false, reason: 'insufficient_confidence' };
}
