import { describe, expect, it } from 'vitest';
import { applySettingsCurrent } from '../../../webview-ui/settings-state';

describe('applySettingsCurrent', () => {
  it('updates openBehavior and does not force the panel open', () => {
    expect(applySettingsCurrent({ open: false, openBehavior: 'splitTab' }, 'newWindow')).toEqual({
      open: false,
      openBehavior: 'newWindow',
    });
  });

  it('leaves an already-open panel open', () => {
    expect(applySettingsCurrent({ open: true, openBehavior: 'splitTab' }, 'newTab')).toEqual({
      open: true,
      openBehavior: 'newTab',
    });
  });
});
