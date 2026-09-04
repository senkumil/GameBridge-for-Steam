import React from 'react';

export interface BigPictureCloudDividerProps {
	title: string;
	state: string;
}

export const BigPictureCloudDivider: React.FC<BigPictureCloudDividerProps> = ({ title, state }) => {
	return (
		<div className="gdl-bp-cloud-badge">
			<svg className="gdl-bp-cloud-svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
				<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
			</svg>
			<span>{title}: {state}</span>
		</div>
	);
};
