import { BULK_TOP_SCORE_THRESHOLD, evaluateBulkCandidate } from '../frontend/features/shortcuts/bulk-policy.ts';

let passed = 0;
function assert(condition, message) {
	if (!condition) throw new Error(`Bulk policy regression failed: ${message}`);
	console.log(`  [PASS] ${message}`);
	passed += 1;
}

const context = (title, exePath = `C:/Games/${title}/${title}.exe`) => ({
	shortcutAppId: 4000000000,
	title,
	exePath,
	startDir: exePath.replace(/[/\\][^/\\]+$/, ''),
	launchOptions: '',
	bootstrapDetected: false,
	recommendedExePath: '',
	recommendedStartDir: '',
	trackingExecutableAutoApply: false,
});

console.log('Running bulk top-score policy runtime checks...');
assert(BULK_TOP_SCORE_THRESHOLD === 58, 'bulk minimum score is exactly 58%');

{
	const result = evaluateBulkCandidate(context('Cyberpunk2077'), [
		{ appid: '1091500', name: 'Cyberpunk 2077', image: '', score: 99, confidence: 'high', reasons: ['steam_store_search'], negative_reasons: [], validation_state: 'confirmed' },
		{ appid: '123', name: 'Cyberpunk Arena', image: '', score: 60, confidence: 'low', reasons: [], negative_reasons: [] },
	]);
	assert(result.safe && result.candidate?.appid === '1091500', '99% top candidate links regardless of extra identity signals');
}

{
	const result = evaluateBulkCandidate(context('b1'), [
		{ appid: '2358720', name: 'Black Myth: Wukong', image: '', score: 58, confidence: 'low', reasons: ['alias_requires_confirmation'], negative_reasons: ['alias_requires_confirmation'], validation_state: 'partial' },
	]);
	assert(result.safe && result.candidate?.appid === '2358720', '58% top candidate is accepted even when previous policy wanted additional identity');
}

{
	const result = evaluateBulkCandidate(context('Resident Evil 4'), [
		{ appid: '2050650', name: 'Resident Evil 4', image: '', score: 82, confidence: 'medium', reasons: [], negative_reasons: [], identity_collision: true },
		{ appid: '254700', name: 'Resident Evil 4 (2005)', image: '', score: 80, confidence: 'medium', reasons: [], negative_reasons: [], identity_collision: true },
	]);
	assert(result.safe && result.candidate?.appid === '2050650', 'highest percentage wins even when candidates are close/ambiguous');
}

{
	const result = evaluateBulkCandidate(context('Unsorted'), [
		{ appid: '111', name: 'First', image: '', score: 60, confidence: 'low', reasons: [], negative_reasons: [] },
		{ appid: '222', name: 'Highest', image: '', score: 74, confidence: 'low', reasons: [], negative_reasons: [] },
	]);
	assert(result.safe && result.candidate?.appid === '222', 'bulk explicitly picks the highest percentage even if input order is stale');
}

{
	const result = evaluateBulkCandidate(context('DLC Filter'), [
		{ appid: '500', name: 'Soundtrack DLC', image: '', score: 95, confidence: 'high', reasons: ['non_game_result'], negative_reasons: ['non_game_result'] },
		{ appid: '600', name: 'Actual Game', image: '', score: 63, confidence: 'low', reasons: [], negative_reasons: [] },
	]);
	assert(result.safe && result.candidate?.appid === '600', 'non-game results are ignored and the highest game candidate wins');
}

{
	const result = evaluateBulkCandidate(context('Below Threshold'), [
		{ appid: '999', name: 'Weak Match', image: '', score: 57, confidence: 'low', reasons: [], negative_reasons: [] },
	]);
	assert(!result.safe && result.reason === 'below_bulk_score_threshold', '57% remains below the requested 58% floor');
}

console.log(`All ${passed} bulk policy runtime checks passed.`);
