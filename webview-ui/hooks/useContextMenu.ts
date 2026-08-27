/**
 * Open/close state for the shared context menu (spec 15). One instance serves
 * the sidebar rows, the table nodes, and the note menus of spec 16, so only one
 * menu can ever be open at a time.
 */
import { useCallback, useState } from 'react';
import type { ContextMenuItem } from '../ContextMenu';

export interface ContextMenuState {
  menu: { x: number; y: number; items: ContextMenuItem[] } | null;
  openMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeMenu: () => void;
}

export function useContextMenu(): ContextMenuState {
  const [menu, setMenu] = useState<ContextMenuState['menu']>(null);

  const openMenu = useCallback((x: number, y: number, items: ContextMenuItem[]): void => {
    setMenu({ x, y, items });
  }, []);

  const closeMenu = useCallback((): void => setMenu(null), []);

  return { menu, openMenu, closeMenu };
}
