import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { SteamGameData } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { steamComponents } from '../../../steam/modules/SteamComponentResolver';
import { desktopFeatureFlags } from '../flags';
import { toSteamDesktopGameInfo } from '../../../steam/desktop/adapters/SteamDesktopGameInfoAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkGameInfoErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error in Desktop Native Game Info' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Desktop][GameInfo] Error in native game info: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || null;
		}
		return this.props.children;
	}
}

interface NativeDesktopGameInfoProps {
	game: SteamGameData;
	fallback?: ReactNode;
}

export const NativeDesktopGameInfo: React.FC<NativeDesktopGameInfoProps> = ({
	game,
	fallback,
}) => {
	if (!desktopFeatureFlags.desktopNativeGameInfo || !desktopFeatureFlags.desktopNativeUIEnabled) {
		return fallback ? <>{fallback}</> : null;
	}

	const NativeGameInfoComponent = steamComponents.resolve('DesktopGameInfo');
	if (!NativeGameInfoComponent) {
		return fallback ? <>{fallback}</> : null;
	}

	const props = toSteamDesktopGameInfo(game);

	return (
		<NativeGameLinkGameInfoErrorBoundary fallback={fallback}>
			<NativeGameInfoComponent {...props} />
		</NativeGameLinkGameInfoErrorBoundary>
	);
};

export function mountNativeDesktopGameInfo(
	container: HTMLElement,
	game: SteamGameData,
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(<NativeDesktopGameInfo game={game} />);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(<NativeDesktopGameInfo game={game} />, container);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Desktop][GameInfo] Mount error: ${e}`);
	}
	return () => {};
}
