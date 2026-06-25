// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
  },
}));

import { DocumentVerificationQR } from '../../print-templates/components/DocumentVerificationQR';

afterEach(() => {
  vi.clearAllMocks();
});

describe('DocumentVerificationQR', () => {
  it('renders nothing when uuid is null', () => {
    const { container } = render(<DocumentVerificationQR uuid={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when uuid is undefined', () => {
    const { container } = render(<DocumentVerificationQR uuid={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an img element with Arabic alt text after QR generates', async () => {
    render(<DocumentVerificationQR uuid="abc-123-test" />);
    const img = await waitFor(() => screen.getByRole('img', { name: 'رمز التحقق' }));
    expect(img).toBeInTheDocument();
  });

  it('img src is a SVG data URL', async () => {
    render(<DocumentVerificationQR uuid="abc-123-test" />);
    const img = await waitFor(() => screen.getByRole('img'));
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });
});
