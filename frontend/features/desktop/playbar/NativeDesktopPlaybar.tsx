import React, { Component, ErrorInfo, ReactNode } from 'react';
import { backendLog } from '../../../api/backend';
import { steamComponents } from '../../../steam/modules/SteamComponentResolver';
import { desktopFeatureFlags } from '../flags';
import { toSteamDesktopPlaybar } from '../../../steam/desktop/adapters/SteamDesktopPlaybarAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkPlaybarErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error in Desktop Native Playbar' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Desktop][Playbar] Error in native playbar: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || null;
		}
		return this.props.children;
	}
}

interface NativeDesktopPlaybarProps {
	shortcutAppId: number | string;
	gameName: string;
	playtimeMinutes: number;
	fallback?: ReactNode;
}

export const NativeDesktopPlaybar: React.FC<NativeDesktopPlaybarProps> = ({
	shortcutAppId,
	gameName,
	playtimeMinutes,
	fallback,
}) => {
	if (!desktopFeatureFlags.desktopNativePlaybar || !desktopFeatureFlags.desktopNativeUIEnabled) {
		return fallback ? <>{fallback}</> : null;
	}

	const NativePlayButton = steamComponents.resolve('DesktopPlayButton');
	if (!NativePlayButton) {
		return fallback ? <>{fallback}</> : null;
	}

	const props = toSteamDesktopPlaybar(shortcutAppId, gameName, playtimeMinutes);

	return (
		<NativeGameLinkPlaybarErrorBoundary fallback={fallback}>
			<NativePlayButton {...props} />
		</NativeGameLinkPlaybarErrorBoundary>
	);
};

export function mountNativeDesktopPlaybar(
	container: HTMLElement,
	shortcutAppId: number | string,
	gameName: string,
	playtimeMinutes: number,
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(
				<NativeDesktopPlaybar
					shortcutAppId={shortcutAppId}
					gameName={gameName}
					playtimeMinutes={playtimeMinutes}
				/>
			);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(
				<NativeDesktopPlaybar
					shortcutAppId={shortcutAppId}
					gameName={gameName}
					playtimeMinutes={playtimeMinutes}
				/>,
				container
			);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Desktop][Playbar] Mount error: ${e}`);
	}
	return () => {};
}
