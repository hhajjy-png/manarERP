import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QRData {
  formType: string;
  formNumber: string;
  entityName: string;
  entityId?: number;
}

export default function FormQRCode({ data, size = 80 }: { data: QRData; size?: number }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    QRCode.toDataURL(JSON.stringify(data), {
      width: size * 2,
      margin: 1,
      color: { dark: '#1d4e6f', light: '#ffffff' },
    })
      .then(setSrc)
      .catch(() => {});
  }, [data, size]);

  if (!src) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <img src={src} alt="QR Code" style={{ width: size, height: size }} />
      <span style={{ fontSize: 9, color: '#94a3b8', direction: 'ltr' }}>{data.formNumber}</span>
    </div>
  );
}
