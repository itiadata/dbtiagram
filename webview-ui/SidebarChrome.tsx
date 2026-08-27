/**
 * Sidebar chrome (spec 11): the collapsed rail and the drag-to-resize strip.
 * Split out of `App.tsx` (spec 17).
 */
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { clampSidebarWidth } from './sidebar-constants';

/**
 * The collapsed state of a sidebar (spec 11): a slim vertical strip with a
 * chevron that reopens the sidebar. The chevron points back toward the
 * collapsed sidebar — left rail points left, right rail points right.
 */
export function SidebarRail({
  side,
  onExpand,
}: {
  side: 'left' | 'right';
  onExpand: () => void;
}): JSX.Element {
  const title = side === 'left' ? 'Show filter sidebar' : 'Show properties sidebar';
  return (
    <div className={`rail rail--${side}`}>
      <button
        type="button"
        className="rail__button"
        title={title}
        aria-label={title}
        onClick={onExpand}
      >
        <span
          className={`sidebar__chevron${side === 'left' ? ' sidebar__chevron--flip' : ''}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/**
 * The drag strip on a visible sidebar's inner edge (spec 11): a ~6px column
 * with `cursor: col-resize` that live-resizes the sidebar via pointer events.
 * Pointer capture keeps the drag alive when the pointer leaves the strip.
 */
export function SidebarResizer({
  side,
  onWidthChange,
}: {
  side: 'left' | 'right';
  onWidthChange: (width: number) => void;
}): JSX.Element {
  const draggingRef = useRef(false);
  const bodyRectRef = useRef<DOMRect | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const body = event.currentTarget.closest('.app__body');
    if (body === null) return;
    bodyRectRef.current = body.getBoundingClientRect();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current || bodyRectRef.current === null) return;
    const body = bodyRectRef.current;
    const raw = side === 'left' ? event.clientX - body.left : body.right - event.clientX;
    onWidthChange(clampSidebarWidth(raw));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    bodyRectRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
