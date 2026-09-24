import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';

/* ────────────────────────────────────────────────────────────────────────────
 *  SplitPane — drag-resizable two-panel layout (horizontal | vertical)
 *
 *  Usage:
 *    <SplitPane direction="vertical" defaultSplit={25} minA={180} minB={200}>
 *      <LeftPanel />
 *      <RightPanel />
 *    </SplitPane>
 *
 *    <SplitPane direction="horizontal" defaultSplit={70} minA={120} minB={80}>
 *      <TopPanel />
 *      <BottomPanel />
 *    </SplitPane>
 * ──────────────────────────────────────────────────────────────────────────── */

interface SplitPaneProps {
  /** 'vertical' = columns side-by-side, 'horizontal' = rows stacked */
  direction: 'vertical' | 'horizontal';
  /** Initial split position as a percentage (0–100) of the first pane */
  defaultSplit?: number;
  /** Minimum pixel size of the first pane */
  minA?: number;
  /** Minimum pixel size of the second pane */
  minB?: number;
  /** Exactly two children required */
  children: [ReactNode, ReactNode];
  /** Additional className on the outer container */
  className?: string;
}

const GUTTER_PX = 6;

export const SplitPane = ({
  direction,
  defaultSplit = 50,
  minA = 80,
  minB = 80,
  children,
  className = '',
}: SplitPaneProps) => {
  const [split, setSplit] = useState(defaultSplit);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const rafId = useRef(0);

  const isVertical = direction === 'vertical';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          const rect = containerRef.current!.getBoundingClientRect();
          const total = isVertical ? rect.width : rect.height;
          const offset = isVertical
            ? ev.clientX - rect.left
            : ev.clientY - rect.top;

          // Clamp between min sizes
          const minPct = (minA / total) * 100;
          const maxPct = 100 - (minB / total) * 100;
          const pct = Math.max(minPct, Math.min(maxPct, (offset / total) * 100));
          setSplit(pct);
        });
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        cancelAnimationFrame(rafId.current);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [isVertical, minA, minB],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const gutterCursor = isVertical ? 'cursor-col-resize' : 'cursor-row-resize';

  return (
    <div
      ref={containerRef}
      className={`flex ${isVertical ? 'flex-row' : 'flex-col'} ${className}`}
      style={{ width: '100%', height: '100%' }}
    >
      {/* ── Pane A ─────────────────────────────────────────── */}
      <div
        className="min-w-0 min-h-0 overflow-hidden"
        style={{
          [isVertical ? 'width' : 'height']: `calc(${split}% - ${GUTTER_PX / 2}px)`,
          flexShrink: 0,
        }}
      >
        {children[0]}
      </div>

      {/* ── Gutter ─────────────────────────────────────────── */}
      <div
        onMouseDown={handleMouseDown}
        className={`${gutterCursor} group flex items-center justify-center z-30 shrink-0 select-none`}
        style={{
          [isVertical ? 'width' : 'height']: `${GUTTER_PX}px`,
        }}
      >
        <div
          className={`rounded-full bg-selected group-hover:bg-emerald-500 group-active:bg-emerald-400 transition-colors duration-150 ${
            isVertical ? 'w-[2px] h-10' : 'h-[2px] w-10'
          }`}
        />
      </div>

      {/* ── Pane B ─────────────────────────────────────────── */}
      <div
        className="min-w-0 min-h-0 overflow-hidden flex-1"
        style={{
          [isVertical ? 'width' : 'height']: `calc(${100 - split}% - ${GUTTER_PX / 2}px)`,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
};

