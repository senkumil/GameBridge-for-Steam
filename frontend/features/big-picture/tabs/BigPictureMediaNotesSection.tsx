import React from 'react';
import { loc } from '../../../steam/localization';

export const BigPictureMediaNotesSection: React.FC = () => {
	return (
		<>
			<section className="gdl-bp-section">
				<h2 className="gdl-bp-section-title">{loc('AppDetails_SectionTitle_Media', 'Media')}</h2>
				<div className="gdl-bp-media-box">
					<div className="gdl-bp-media-copy">
						{loc('AppDetails_ScreenshotHint_Gamepad', 'You can take a screenshot while playing from the Steam overlay.')}
					</div>
					<button className="gdl-bp-action-button Focusable" type="button" tabIndex={0} data-focusable="true">
						{loc('AppDetails_GoToMediaLibrary', 'Go to my media library')}
					</button>
				</div>
			</section>
			<section className="gdl-bp-section">
				<h2 className="gdl-bp-section-title">{loc('AppDetails_SectionTitle_GameNotes', 'Notes')}</h2>
				<div className="gdl-bp-notes-box">
					<button className="gdl-bp-action-button Focusable" type="button" tabIndex={0} data-focusable="true">
						✎ {loc('AppDetails_CreateNewNote', 'New note')}
					</button>
				</div>
			</section>
		</>
	);
};
