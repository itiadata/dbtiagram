/**
 * The layout message protocol, exercised with a stub host (spec 17). These run
 * under Vitest without the Electron host, which is the point of extracting the
 * handlers out of `DiagramPanel`.
 */
import { describe, expect, it } from 'vitest';
import {
  DiagramLayoutParseError,
  LAYOUT_VERSION,
  type DiagramLayout,
} from '../../../src/diagram/layoutFile';
import {
  openLayout,
  publishActiveLayout,
  saveLayout,
  sendActiveLayout,
  cachePendingLayout,
  type ActiveLayout,
  type LayoutHost,
} from '../../../src/webview/layoutMessages';
import type { MessageToWebview } from '../../../src/shared/protocol';

const layout: DiagramLayout = {
  version: LAYOUT_VERSION,
  name: 'orders',
  tables: [{ name: 'orders', x: 10, y: 20 }],
  notes: [],
};

interface StubHost extends LayoutHost {
  posted: MessageToWebview[];
  writes: Array<{ fsPath: string; layout: DiagramLayout }>;
  opened: string[];
  saved: Array<{ fsPath: string; name: string }>;
  republished: number;
  pending: Array<{ layout: DiagramLayout; dirty: boolean }>;
}

function createHost(overrides: Partial<LayoutHost> = {}): StubHost {
  const posted: MessageToWebview[] = [];
  const writes: Array<{ fsPath: string; layout: DiagramLayout }> = [];
  const opened: string[] = [];
  const saved: Array<{ fsPath: string; name: string }> = [];
  const pending: Array<{ layout: DiagramLayout; dirty: boolean }> = [];
  let active: ActiveLayout | undefined;
  let pendingLayout: { layout: DiagramLayout; dirty: boolean } | undefined;
  const host: StubHost = {
    posted,
    writes,
    opened,
    saved,
    republished: 0,
    pending,
    postMessage: (message) => {
      posted.push(message);
    },
    getActiveLayout: () => active,
    setActiveLayout: (next) => {
      active = next;
    },
    readLayout: async () => layout,
    writeLayout: async (fsPath, written) => {
      writes.push({ fsPath, layout: written });
    },
    promptForLayoutPath: async () => undefined,
    knownModelNames: () => new Set(['orders']),
    onLayoutOpened: (name) => {
      opened.push(name);
    },
    onLayoutSaved: (fsPath, name) => {
      saved.push({ fsPath, name });
    },
    republish: () => {
      host.republished += 1;
    },
    setPendingLayout: (nextLayout, dirty) => {
      pendingLayout = { layout: nextLayout, dirty };
      pending.push({ layout: nextLayout, dirty });
    },
    getPendingLayout: () => pendingLayout,
    ...overrides,
  };
  return host;
}

describe('openLayout', () => {
  it('applies the layout and records it as active', async () => {
    const host = createHost();
    await openLayout(host, '/w/orders.dbtiagram.yml');

    expect(host.getActiveLayout()).toEqual({ fsPath: '/w/orders.dbtiagram.yml', name: 'orders' });
    expect(host.opened).toEqual(['orders']);
    expect(host.republished).toBe(1);
    expect(host.posted).toContainEqual({ type: 'layout:apply', layout, missing: [] });
    expect(host.posted).toContainEqual({
      type: 'layout:active',
      path: '/w/orders.dbtiagram.yml',
      name: 'orders',
    });
  });

  it('reports models in the layout that no longer exist', async () => {
    const host = createHost({ knownModelNames: () => new Set<string>() });
    await openLayout(host, '/w/orders.dbtiagram.yml');

    const applied = host.posted.find((m) => m.type === 'layout:apply');
    expect(applied).toMatchObject({ missing: ['orders'] });
  });

  it('posts a readable error and stays inactive when the file is invalid', async () => {
    const host = createHost({
      readLayout: async () => {
        throw new DiagramLayoutParseError('orders', 'unsupported version 9');
      },
    });
    await openLayout(host, '/w/orders.dbtiagram.yml');

    expect(host.getActiveLayout()).toBeUndefined();
    expect(host.posted).toEqual([
      { type: 'diagram:error', message: 'Could not open orders: unsupported version 9' },
    ]);
  });
});

describe('sendActiveLayout', () => {
  it('does nothing when no layout is active', async () => {
    const host = createHost();
    await sendActiveLayout(host);
    expect(host.posted).toEqual([]);
  });

  it('re-reads the active file and re-applies it', async () => {
    const host = createHost();
    host.setActiveLayout({ fsPath: '/w/orders.dbtiagram.yml', name: 'stale' });
    await sendActiveLayout(host);

    expect(host.getActiveLayout()?.name).toBe('orders');
    expect(host.posted).toContainEqual({ type: 'layout:apply', layout, missing: [] });
  });

  it('stays silent when the active file became unreadable', async () => {
    const host = createHost({
      readLayout: async () => {
        throw new Error('ENOENT');
      },
    });
    host.setActiveLayout({ fsPath: '/w/orders.dbtiagram.yml', name: 'orders' });
    await sendActiveLayout(host);

    expect(host.posted).toEqual([]);
  });
});

describe('saveLayout', () => {
  it('prompts when there is no active layout and adopts the chosen path', async () => {
    const host = createHost({ promptForLayoutPath: async () => '/w/picked.dbtiagram.yml' });
    await saveLayout(host, layout);

    expect(host.writes).toEqual([
      { fsPath: '/w/picked.dbtiagram.yml', layout: { ...layout, name: 'picked' } },
    ]);
    expect(host.saved).toEqual([{ fsPath: '/w/picked.dbtiagram.yml', name: 'picked' }]);
    expect(host.getActiveLayout()).toEqual({ fsPath: '/w/picked.dbtiagram.yml', name: 'picked' });
  });

  it('is a no-op when the save dialog is cancelled', async () => {
    const host = createHost();
    await saveLayout(host, layout);

    expect(host.writes).toEqual([]);
    expect(host.saved).toEqual([]);
    expect(host.getActiveLayout()).toBeUndefined();
  });

  it('writes straight to the active layout without prompting', async () => {
    const host = createHost({
      promptForLayoutPath: async () => {
        throw new Error('should not prompt');
      },
    });
    host.setActiveLayout({ fsPath: '/w/orders.dbtiagram.yml', name: 'orders' });
    await saveLayout(host, layout);

    expect(host.writes.map((w) => w.fsPath)).toEqual(['/w/orders.dbtiagram.yml']);
  });

  it('clears the pending cache on success', async () => {
    const host = createHost();
    host.setActiveLayout({ fsPath: '/w/orders.dbtiagram.yml', name: 'orders' });
    host.setPendingLayout(layout, true);
    await saveLayout(host, layout);

    expect(host.getPendingLayout()).toEqual({ layout, dirty: false });
  });

  it('reports write failures to the webview', async () => {
    const host = createHost({
      writeLayout: async () => {
        throw new Error('EACCES');
      },
    });
    host.setActiveLayout({ fsPath: '/w/orders.dbtiagram.yml', name: 'orders' });
    await saveLayout(host, layout);

    expect(host.posted).toEqual([
      { type: 'diagram:error', message: 'Could not save diagram: EACCES' },
    ]);
  });
});

describe('cachePendingLayout', () => {
  it('calls host.setPendingLayout with the given layout and dirty flag', () => {
    const host = createHost();
    cachePendingLayout(host, layout, true);

    expect(host.pending).toEqual([{ layout, dirty: true }]);
    expect(host.getPendingLayout()).toEqual({ layout, dirty: true });
  });
});

describe('publishActiveLayout', () => {
  it('publishes nulls when no layout is active', () => {
    const host = createHost();
    publishActiveLayout(host);
    expect(host.posted).toEqual([{ type: 'layout:active', path: null, name: null }]);
  });
});
