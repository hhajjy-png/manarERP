interface Props {
  text: string | null | undefined;
  maxChars?: number;
  className?: string;
}

export default function TruncatedText({ text, maxChars = 40, className }: Props) {
  if (!text) return <span className={className}>—</span>;

  if (text.length <= maxChars) {
    return <span className={className}>{text}</span>;
  }

  const truncated = text.slice(0, maxChars) + '…';

  return (
    <span
      className={className}
      title={text}
      style={{ cursor: 'help' }}
    >
      {truncated}
    </span>
  );
}
