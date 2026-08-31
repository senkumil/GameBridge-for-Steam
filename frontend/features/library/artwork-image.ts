/** Fetch an image URL with a bounded direct request and a CORS fallback for
 * non-Steam providers. Explicit client errors are authoritative misses. */
export async function imageUrlToBase64(url: string): Promise<string | null> {
	if (!url || typeof url !== 'string') return null;
	const fetchWithTimeout = async (value: string, timeoutMs = 4000): Promise<{ ok: boolean; status: number; blob: Blob | null }> => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(value, { signal: controller.signal });
			clearTimeout(timer);
			if (!response.ok) return { ok: false, status: response.status, blob: null };
			return { ok: true, status: response.status, blob: await response.blob() };
		} catch {
			clearTimeout(timer);
			return { ok: false, status: 0, blob: null };
		}
	};
	const blobToDataUrl = (blob: Blob): Promise<string | null> => new Promise(resolve => {
		if (!blob || blob.size < 100) { resolve(null); return; }
		const reader = new FileReader();
		reader.onloadend = () => resolve((reader.result as string) || null);
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(blob);
	});
	const direct = await fetchWithTimeout(url);
	if (direct.ok && direct.blob) {
		const dataUrl = await blobToDataUrl(direct.blob);
		if (dataUrl) return dataUrl;
	}
	if (direct.status >= 400 && direct.status < 500) return null;
	if (!url.includes('steamstatic.com') && !url.includes('steampowered.com')) {
		const proxied = 'https://wsrv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//, '')) + '&output=png';
		const fallback = await fetchWithTimeout(proxied);
		if (fallback.ok && fallback.blob) return await blobToDataUrl(fallback.blob);
	}
	return null;
}

/** Normalize community artwork to Steam's native canvas for each slot. */
export async function normalizeCommunityArtworkDataUrl(dataUrl: string, imageType: number): Promise<string | null> {
	const targetByType: Record<number, { width: number; height: number; fit: 'cover' | 'contain' }> = {
		0: { width: 600, height: 900, fit: 'cover' },
		1: { width: 1920, height: 620, fit: 'cover' },
		2: { width: 1280, height: 720, fit: 'contain' },
		3: { width: 920, height: 430, fit: 'cover' },
	};
	const target = targetByType[imageType];
	if (!target) return dataUrl;
	return await new Promise(resolve => {
		const image = new Image();
		image.onload = () => {
			try {
				const sourceWidth = Math.max(1, image.naturalWidth || image.width || target.width);
				const sourceHeight = Math.max(1, image.naturalHeight || image.height || target.height);
				const scale = target.fit === 'cover'
					? Math.max(target.width / sourceWidth, target.height / sourceHeight)
					: Math.min(target.width / sourceWidth, target.height / sourceHeight);
				const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
				const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
				const canvas = document.createElement('canvas');
				canvas.width = target.width;
				canvas.height = target.height;
				const context = canvas.getContext('2d');
				if (!context) { resolve(dataUrl); return; }
				context.clearRect(0, 0, target.width, target.height);
				context.imageSmoothingEnabled = true;
				context.imageSmoothingQuality = 'high';
				context.drawImage(image, Math.round((target.width - drawWidth) / 2),
					Math.round((target.height - drawHeight) / 2), drawWidth, drawHeight);
				resolve(canvas.toDataURL('image/png'));
			} catch { resolve(dataUrl); }
		};
		image.onerror = () => resolve(dataUrl);
		image.src = dataUrl;
	});
}
