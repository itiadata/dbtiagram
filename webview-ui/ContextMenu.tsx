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
import { placeMenu, placeSubmenu, type MenuPlacement } from './context-menu-position';

export interface ContextMenuItem {
  label: string;
  disabled?: boolean;
  checked?: boolean;
  title?: string;
  /** Ignored when `items` is present — a parent item opens its submenu instead. */
  onSelect?: () => void;
  /** A submenu flyout, opened by clicking this item instead of invoking `onSelect`. */
  items?: ContextMenuItem[];
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
      // Submenus render as separate `createPortal` trees (siblings in
      // `document.body`, not DOM descendants of the root `<ul>`), so a plain
      // `ref.contains` check here would treat every click inside an open
      // submenu as "outside" and close the whole menu on pointerdown — before
      // the button's click handler ever runs. Checking `.closest('.context-menu')`
      // recognizes a click anywhere inside the root OR a submenu flyout.
      const target = event.target;
      if (target instanceof Element && target.closest('.context-menu') !== null) {
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
        <ContextMenuRow key={item.label} item={item} onClose={onClose} />
      ))}
    </ul>,
    document.body,
  );
}

interface ContextMenuRowProps {
  item: ContextMenuItem;
  /** Closes the WHOLE menu (root + any open submenu), e.g. after a leaf click. */
  onClose: () => void;
}

/**
 * One `<li>` of the menu. A leaf item behaves as before (`onSelect` then
 * `onClose`); an item with `items` opens an inline flyout anchored to its own
 * rect on HOVER (mouseenter), closing when the pointer leaves both the row
 * and the flyout, via the same `placeMenu` flip/clamp geometry the root menu
 * uses (spec 24). A short close delay lets the pointer cross the visual gap
 * between the row and the flyout without flickering shut.
 */
function ContextMenuRow({ item, onClose }: ContextMenuRowProps): JSX.Element {
  const rowRef = useRef<HTMLLIElement | null>(null);
  const [rowHovered, setRowHovered] = useState(false);
  const [submenuHovered, setSubmenuHovered] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const hasSubmenu = item.items !== undefined && item.items.length > 0;
  const submenuOpen = hasSubmenu && (rowHovered || submenuHovered);

  const clearCloseTimer = (): void => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => clearCloseTimer, []);

  return (
    <li
      ref={rowRef}
      role="none"
      className="context-menu__row"
      onMouseEnter={() => {
        clearCloseTimer();
        setRowHovered(true);
      }}
      onMouseLeave={() => {
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => setRowHovered(false), 150);
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="context-menu__item"
        aria-disabled={item.disabled === true ? 'true' : undefined}
        aria-haspopup={hasSubmenu ? 'true' : undefined}
        aria-expanded={hasSubmenu ? submenuOpen : undefined}
        disabled={item.disabled === true}
        title={item.title}
        onClick={
          item.disabled === true || hasSubmenu
            ? undefined
            : () => {
                item.onSelect?.();
                onClose();
              }
        }
      >
        <span className="context-menu__check">{item.checked === true ? '✓' : ''}</span>
        {item.label}
        {hasSubmenu && <span className="context-menu__submenu-arrow" aria-hidden="true">›</span>}
      </button>
      {hasSubmenu && submenuOpen && (
        <ContextSubmenu
          items={item.items ?? []}
          anchor={rowRef.current}
          onClose={onClose}
          onMouseEnter={() => {
            clearCloseTimer();
            setSubmenuHovered(true);
          }}
          onMouseLeave={() => {
            clearCloseTimer();
            closeTimerRef.current = window.setTimeout(() => setSubmenuHovered(false), 150);
          }}
        />
      )}
    </li>
  );
}

interface ContextSubmenuProps {
  items: ContextMenuItem[];
  anchor: HTMLLIElement | null;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** The flyout `<ul>` for a submenu, placed relative to its parent item's rect. */
function ContextSubmenu({
  items,
  anchor,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: ContextSubmenuProps): JSX.Element | null {
  const ref = useRef<HTMLUListElement | null>(null);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || anchor === null) {
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = element.getBoundingClientRect();
    setPlacement(
      placeSubmenu(
        { left: anchorRect.left, right: anchorRect.right, top: anchorRect.top },
        { width: menuRect.width, height: menuRect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, items]);

  if (items.length === 0) {
    return null;
  }

  return createPortal(
    <ul
      ref={ref}
      className="context-menu context-menu--submenu"
      role="menu"
      style={placement === null ? { visibility: 'hidden' } : { left: placement.left, top: placement.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map((item) => (
        <ContextMenuRow key={item.label} item={item} onClose={onClose} />
      ))}
    </ul>,
    document.body,
  );
}
