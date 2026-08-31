interface ArtworkQualitySpec {
	minWidth: number;
	minHeight: number;
	minRatio: number;
	maxRatio: number;
}

const AUTOMATIC_SLOT_QUALITY: Record<number, ArtworkQualitySpec> = {
	0: { minWidth: 300, minHeight: 400, minRatio: 0.52, maxRatio: 0.82 },
	1: { minWidth: 1280, minHeight: 400, minRatio: 2.35, maxRatio: 3.65 },
	2: { minWidth: 128, minHeight: 64, minRatio: 0.35, maxRatio: 8 },
	3: { minWidth: 400, minHeight: 180, minRatio: 1.6, maxRatio: 2.65 },
};

/** Reject automatic sources that would need severe cropping or upscaling.
 * Explicit user selections intentionally bypass this policy. */
export async function automaticArtworkMeetsSlotQuality(dataUrl: string, imageType: number): Promise<boolean> {
	const spec = AUTOMATIC_SLOT_QUALITY[imageType];
	if (!spec || !dataUrl) return false;
	return await new Promise(resolve => {
		const image = new Image();
		image.onload = () => {
			const width = Number(image.naturalWidth || image.width || 0);
			const height = Number(image.naturalHeight || image.height || 0);
			const ratio = height > 0 ? width / height : 0;
			resolve(width >= spec.minWidth && height >= spec.minHeight
				&& ratio >= spec.minRatio && ratio <= spec.maxRatio);
		};
		image.onerror = () => resolve(false);
		image.src = dataUrl;
	});
}
