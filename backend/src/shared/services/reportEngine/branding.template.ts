import type { ReportBranding } from './reportTypes';
import type { ProfileConfig } from './printProfiles';
import { resolveLogoWidth, resolveLogoJustify } from './styles.template';
import { esc } from './htmlUtils';

export function buildBrandingHeader(
  branding: ReportBranding,
  config?: Pick<ProfileConfig, 'headerHeight' | 'logoSize' | 'logoAlignment'>
): string {
  const headerStyle = config?.headerHeight
    ? ` style="min-height: ${config.headerHeight}"`
    : '';
  const logoWrapStyle = `display:flex;justify-content:${resolveLogoJustify(config?.logoAlignment)}`;
  const logoWidthStyle = `width:${resolveLogoWidth(config?.logoSize)};height:auto`;

  const logoHtml = branding.logoBase64
    ? `<img src="data:image/png;base64,${branding.logoBase64}" alt="شعار الشركة" class="company-logo branding-logo" style="${logoWidthStyle}">`
    : `<div class="company-logo-placeholder branding-logo" style="${logoWidthStyle}">م</div>`;

  const contactParts: string[] = [];
  if (branding.phone)         contactParts.push(esc(branding.phone));
  if (branding.address)       contactParts.push(esc(branding.address));
  if (branding.commercialReg) contactParts.push(`س.ت: ${esc(branding.commercialReg)}`);
  if (branding.email)         contactParts.push(esc(branding.email));
  const contactLine = contactParts.join('  ·  ');

  return `
    <div class="company-header"${headerStyle}>
      <div class="branding-logo-wrap" style="${logoWrapStyle}">${logoHtml}</div>
      <div class="company-info">
        <div class="company-name-ar">${esc(branding.companyNameAr)}</div>
        ${branding.companyNameEn ? `<div class="company-name-en">${esc(branding.companyNameEn)}</div>` : ''}
        ${contactLine ? `<div class="company-contact">${contactLine}</div>` : ''}
      </div>
    </div>
    <hr class="company-divider">
  `;
}
