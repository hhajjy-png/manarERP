import { describe, it, expect } from 'vitest';
import { createCompanyPrintData } from '../../print-templates/adapters/companyData';

describe('createCompanyPrintData — branding fields', () => {
  it('signatureUrl string override is applied', () => {
    const url = 'data:image/png;base64,abc123';
    const result = createCompanyPrintData({ signatureUrl: url });
    expect(result.signatureUrl).toBe(url);
  });

  it('stampUrl string override is applied', () => {
    const url = 'data:image/png;base64,xyz789';
    const result = createCompanyPrintData({ stampUrl: url });
    expect(result.stampUrl).toBe(url);
  });

  it('showSignature boolean false is applied', () => {
    const result = createCompanyPrintData({ showSignature: false });
    expect(result.showSignature).toBe(false);
  });

  it('showStamp boolean true is applied', () => {
    const result = createCompanyPrintData({ showStamp: true });
    expect(result.showStamp).toBe(true);
  });

  it('branding fields are undefined when no overrides', () => {
    const result = createCompanyPrintData();
    expect(result.signatureUrl).toBeUndefined();
    expect(result.stampUrl).toBeUndefined();
    expect(result.showSignature).toBeUndefined();
    expect(result.showStamp).toBeUndefined();
  });

  it('branding and text fields can be mixed in one call', () => {
    const result = createCompanyPrintData({
      email: 'test@example.com',
      signatureUrl: 'data:image/png;base64,sig',
      showSignature: true,
    });
    expect(result.email).toBe('test@example.com');
    expect(result.signatureUrl).toBe('data:image/png;base64,sig');
    expect(result.showSignature).toBe(true);
    // Other defaults preserved
    expect(result.nameAr).toContain('المنار');
  });
});
