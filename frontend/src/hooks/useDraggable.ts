import { useRef, useCallback } from 'react';

/**
 * هوك بسيط لجعل العنصر قابلاً للسحب عبر الفأرة.
 *
 * الاستخدام:
 *   const { containerRef, onHeaderMouseDown, resetPosition } = useDraggable();
 *   <div ref={containerRef}>
 *     <div onMouseDown={onHeaderMouseDown} style={{ cursor: 'move' }}>Header</div>
 *     ...
 *   </div>
 */
export function useDraggable() {
  const offset = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ mouseX: 0, mouseY: 0, offsetX: 0, offsetY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    // لا نبدأ السحب إذا نقر المستخدم على زر داخل الرأس
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      offsetX: offset.current.x,
      offsetY: offset.current.y,
    };

    const handleMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const x = dragStart.current.offsetX + (ev.clientX - dragStart.current.mouseX);
      const y = dragStart.current.offsetY + (ev.clientY - dragStart.current.mouseY);
      offset.current = { x, y };
      containerRef.current.style.transform = `translate(${x}px, ${y}px)`;
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    e.preventDefault();
  }, []);

  const resetPosition = useCallback(() => {
    offset.current = { x: 0, y: 0 };
    if (containerRef.current) containerRef.current.style.transform = '';
  }, []);

  return { containerRef, onHeaderMouseDown, resetPosition };
}
