import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  uuid: string | null | undefined;
  size?: number;
}

export function DocumentVerificationQR({ uuid, size = 80 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) { setDataUrl(null); return; }
    QRCode.toString(uuid, { type: 'svg', width: size, margin: 1 })
      .then(svg => {
        setDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => setDataUrl(null));
  }, [uuid, size]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      alt="رمز التحقق"
      width={size}
      height={size}
      style={{ display: 'block' }}
    />
  );
}
