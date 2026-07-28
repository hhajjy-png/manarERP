import { useEffect, useState } from 'react';
import type { CompanyBranding } from './useCompanyBranding';
import {
  NO_ASSET,
  defaultSelectionId,
  resolveAssetById,
  type BrandingAsset,
} from '../branding/brandingAssets';

/**
 * Per-print choice of **which** signature and **which** stamp a document uses.
 *
 * Two orthogonal questions, one per control:
 *   `signatureId` / `stampId` — which asset (`NO_ASSET` = none)
 *   `showSignature` / `showStamp` — whether to print the chosen one
 *
 * The resolved `signatureUrl` / `stampUrl` are the only thing a document ever needs:
 * feed them into `createCompanyPrintData` and the template renders them at its own
 * position and size. Accurate preview, the print dialog and PDF export all compose from
 * that same rendered node, so they cannot disagree with the picker.
 *
 * ── Adding a new form to the system ──────────────────────────────────────────────
 *   const branding  = useCompanyBranding();
 *   const selection = useBrandingSelection(branding);
 *   …createCompanyPrintData({ ...brandingSelectionFields(selection) })
 *   …<BrandingAssetPicker selection={selection} />   in the toolbar
 * Nothing else — no image files, no per-form resolution logic.
 */
export interface BrandingSelection {
  signatures: BrandingAsset[];
  stamps: BrandingAsset[];
  signatureId: string;
  stampId: string;
  setSignatureId: (id: string) => void;
  setStampId: (id: string) => void;
  showSignature: boolean;
  showStamp: boolean;
  setShowSignature: (show: boolean) => void;
  setShowStamp: (show: boolean) => void;
  /** Image of the currently selected signature, or `undefined` for "none". */
  signatureUrl: string | undefined;
  /** Image of the currently selected stamp, or `undefined` for "none". */
  stampUrl: string | undefined;
  /** False until Settings have loaded and the defaults have been applied. */
  ready: boolean;
}

export function useBrandingSelection(branding: CompanyBranding): BrandingSelection {
  const [signatureId, setSignatureId] = useState(NO_ASSET);
  const [stampId, setStampId] = useState(NO_ASSET);
  const [showSignature, setShowSignature] = useState(true);
  const [showStamp, setShowStamp] = useState(true);
  const [ready, setReady] = useState(false);

  // Seed from the company defaults once, then leave the user's choice alone.
  useEffect(() => {
    if (branding.loading || ready) return;
    setSignatureId(defaultSelectionId(branding.signatures));
    setStampId(defaultSelectionId(branding.stamps));
    setShowSignature(branding.showSignature);
    setShowStamp(branding.showStamp);
    setReady(true);
  }, [
    branding.loading,
    branding.signatures,
    branding.stamps,
    branding.showSignature,
    branding.showStamp,
    ready,
  ]);

  const signature = resolveAssetById(branding.signatures, signatureId);
  const stamp = resolveAssetById(branding.stamps, stampId);

  return {
    signatures: branding.signatures,
    stamps: branding.stamps,
    signatureId,
    stampId,
    setSignatureId,
    setStampId,
    showSignature,
    showStamp,
    setShowSignature,
    setShowStamp,
    signatureUrl: signature?.imageUrl,
    stampUrl: stamp?.imageUrl,
    ready,
  };
}

/** The four `CompanyPrintData` branding fields a selection contributes. */
export function brandingSelectionFields(selection: BrandingSelection): {
  signatureUrl: string | undefined;
  stampUrl: string | undefined;
  showSignature: boolean;
  showStamp: boolean;
} {
  return {
    signatureUrl: selection.signatureUrl,
    stampUrl: selection.stampUrl,
    showSignature: selection.showSignature,
    showStamp: selection.showStamp,
  };
}
