import React, { useEffect, useRef } from 'react';
import type { StaticTextKey } from './staticTextTypes';
import { STATIC_TEXT_LIMITS } from './staticTextTypes';

interface Props {
  left: number;
  top: number;
  minWidth: number;
  editingKey: StaticTextKey;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export default function InlineTextEditor({
  left,
  top,
  minWidth,
  editingKey,
  value,
  error,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    e.stopPropagation();
  }

  const limit = STATIC_TEXT_LIMITS[editingKey];

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        zIndex: 9500,
        minWidth: Math.max(minWidth, 160),
        maxWidth: 380,
        background: '#fff',
        border: '2px solid #3b82f6',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        padding: 8,
        pointerEvents: 'all',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        maxLength={limit}
        dir="auto"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'none',
          border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
          borderRadius: 4,
          padding: '4px 6px',
          fontSize: 12,
          fontFamily: 'inherit',
          direction: 'auto' as React.CSSProperties['direction'],
          outline: 'none',
        }}
      />
      {error && (
        <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#94a3b8', flex: 1 }}>{value.length}/{limit}</span>
        <button
          type="button"
          onClick={onCancel}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}
        >
          إلغاء (Esc)
        </button>
        <button
          type="button"
          onClick={onCommit}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          حفظ (Enter)
        </button>
      </div>
    </div>
  );
}
