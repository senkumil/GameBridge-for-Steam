import { fetchArtworkImageBackend } from '../../api/backend';

/** Fetch an image URL with a bounded direct request and a CORS fallback for
 * non-Steam providers. Explicit client errors are authoritative misses. */
export async function imageUrlToBase64(url: string): Promise<string | null> {
	if (!url || typeof url !== 'string') return null;
	if (/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(url)) return url;
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
	// Steam's CEF may reject otherwise valid image hosts because of CORS. Use
	// the plugin backend as a strictly allow-listed binary bridge instead of a
	// public third-party image proxy.
	try {
		const raw = await fetchArtworkImageBackend({ request_json: JSON.stringify({ url }) });
		let value: any = raw;
		for (let attempt = 0; attempt < 3 && typeof value === 'string'; attempt += 1) value = JSON.parse(value);
		const base64 = typeof value?.data_base64 === 'string' ? value.data_base64 : '';
		const mime = typeof value?.mime === 'string' && /^image\/(?:png|jpeg|webp)$/.test(value.mime) ? value.mime : '';
		if (value?.ok === true && base64 && mime) return `data:${mime};base64,${base64}`;
	} catch {}
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
	const baseTarget = targetByType[imageType];
	if (!baseTarget) return dataUrl;
	return await new Promise(resolve => {
		const image = new Image();
		image.onload = () => {
			try {
				const sourceWidth = Math.max(1, image.naturalWidth || image.width || baseTarget.width);
				const sourceHeight = Math.max(1, image.naturalHeight || image.height || baseTarget.height);
				const is2x = sourceWidth >= baseTarget.width * 1.4 || sourceHeight >= baseTarget.height * 1.4;
				const target = is2x
					? { width: baseTarget.width * 2, height: baseTarget.height * 2, fit: baseTarget.fit }
					: baseTarget;
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
