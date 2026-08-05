import { useT } from '../../lib/i18n';
import { NO_ASSET, selectableAssets, type BrandingAsset } from '../branding/brandingAssets';
import type { BrandingSelection } from '../hooks/useBrandingSelection';

/**
 * The one control every printable form uses to pick its signature and stamp.
 *
 * Each kind gets a dropdown (with a «بدون» entry) plus the show/hide checkbox the
 * toolbars already had. The dropdown answers *which* asset, the checkbox answers
 * *whether* to print it — so neither replaces the other and the previous behaviour of
 * the checkbox is untouched.
 *
 * A kind with no usable asset renders nothing for that kind; when neither kind has one
 * the whole control disappears, exactly as the old toolbars did with no image uploaded.
 */
interface Props {
  selection: BrandingSelection;
  /**
   * Adds the barcode's show/hide checkbox to the SAME group, for the documents that draw
   * one. Absent ⇒ this control is exactly what it has always been, so no form gains a
   * toggle for an element it does not render. There is no dropdown beside it because a
   * barcode is generated from the document rather than chosen from Settings.
   */
  withBarcode?: boolean;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 6px',
  maxWidth: 150,
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
};

export default function BrandingAssetPicker({ selection, withBarcode }: Props) {
  const { t } = useT();

  const signatureOptions = selectableAssets(selection.signatures);
  const stampOptions = selectableAssets(selection.stamps);
  // The barcode needs no uploaded asset, so it alone can keep the control on screen.
  if (signatureOptions.length === 0 && stampOptions.length === 0 && !withBarcode) return null;

  const optionLabel = (asset: BrandingAsset, index: number, indexKey: string): string =>
    asset.name.trim() || asset.title.trim() || t(indexKey, { n: index + 1 });

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        fontSize: 13,
        padding: '4px 10px',
        background: 'var(--surface-2)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      {signatureOptions.length > 0 && (
        <span style={rowStyle}>
          <label htmlFor="branding-pick-signature" style={{ color: 'var(--text)' }}>
            {t('lbl.signature_chrome')}
          </label>
          <select
            id="branding-pick-signature"
            style={selectStyle}
            value={selection.signatureId}
            onChange={(e) => selection.setSignatureId(e.target.value)}
          >
            <option value={NO_ASSET}>{t('lbl.branding_asset.none')}</option>
            {signatureOptions.map((asset, i) => (
              <option key={asset.id} value={asset.id}>
                {optionLabel(asset, i, 'page.settings.signatures.index_label')}
              </option>
            ))}
          </select>
          <input
            type="checkbox"
            aria-label={t('page.settings.show_in_documents')}
            title={t('page.settings.show_in_documents')}
            checked={selection.showSignature}
            disabled={!selection.signatureUrl}
            onChange={(e) => selection.setShowSignature(e.target.checked)}
          />
        </span>
      )}

      {stampOptions.length > 0 && (
        <span style={rowStyle}>
          <label htmlFor="branding-pick-stamp" style={{ color: 'var(--text)' }}>
            {t('lbl.stamp_chrome')}
          </label>
          <select
            id="branding-pick-stamp"
            style={selectStyle}
            value={selection.stampId}
            onChange={(e) => selection.setStampId(e.target.value)}
          >
            <option value={NO_ASSET}>{t('lbl.branding_asset.none')}</option>
            {stampOptions.map((asset, i) => (
              <option key={asset.id} value={asset.id}>
                {optionLabel(asset, i, 'page.settings.stamps.index_label')}
              </option>
            ))}
          </select>
          <input
            type="checkbox"
            aria-label={t('page.settings.show_stamp_in_documents')}
            title={t('page.settings.show_stamp_in_documents')}
            checked={selection.showStamp}
            disabled={!selection.stampUrl}
            onChange={(e) => selection.setShowStamp(e.target.checked)}
          />
        </span>
      )}

      {withBarcode && (
        <span style={rowStyle}>
          <label htmlFor="branding-pick-barcode" style={{ color: 'var(--text)' }}>
            {t('lbl.barcode_chrome')}
          </label>
          <input
            id="branding-pick-barcode"
            type="checkbox"
            aria-label={t('page.settings.show_barcode_in_documents')}
            title={t('page.settings.show_barcode_in_documents')}
            checked={selection.showBarcode}
            onChange={(e) => selection.setShowBarcode(e.target.checked)}
          />
        </span>
      )}
    </span>
  );
}
