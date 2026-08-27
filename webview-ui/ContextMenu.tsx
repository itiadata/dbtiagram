/**
 * Reusable portal-rendered context menu (spec 15), shared by the sidebar model
 * rows, the table nodes, and the note menus of spec 16.
 *
 * It renders into `document.body` so no sidebar/canvas overflow can clip it,
 * measures itself after the first paint, and flips near the viewport edges via
 * the pure `placeMenu` geometry.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeMenu, type MenuPlacement } from './context-menu-position';

export interface ContextMenuItem {
  label: string;
  disabled?: boolean;
  checked?: boolean;
  title?: string;
  onSelect: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element | null {
  const ref = useRef<HTMLUListElement | null>(null);
  // Render at the raw point first, then correct once the size is known.
  const [placement, setPlacement] = useState<MenuPlacement>({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const rect = element.getBoundingClientRect();
    setPlacement(
      placeMenu(
        { x, y },
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [x, y, items]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      const element = ref.current;
      if (element !== null && event.target instanceof globalThis.Node && element.contains(event.target)) {
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    // Capture phase: scrolling any ancestor (the sidebar list included) closes
    // the menu, which would otherwise float away from its row.
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  if (items.length === 0) {
    return null;
  }

  return createPortal(
    <ul
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: placement.left, top: placement.top }}
    >
      {items.map((item) => (
        <li key={item.label} role="none">
          <button
            type="button"
            role="menuitem"
            className="context-menu__item"
            aria-disabled={item.disabled === true ? 'true' : undefined}
            disabled={item.disabled === true}
            title={item.title}
            onClick={
              item.disabled === true
                ? undefined
                : () => {
                    item.onSelect();
                    onClose();
                  }
            }
          >
            <span className="context-menu__check">{item.checked === true ? '✓' : ''}</span>
            {item.label}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
