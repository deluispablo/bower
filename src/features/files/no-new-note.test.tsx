import { cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { useNodeMenu } from './Explorer';

const initial = useUi.getState();
afterEach(() => { cleanup(); useUi.setState(initial, true); });

it('the folder row menu has New folder and no New note', () => {
  const sources = loadingSources();
  const { result } = renderHook(() => useNodeMenu({ path: 'Resources/Cooking', name: 'Cooking', type: 'folder', modified: 0, created: 0 }), {
    wrapper: ({ children }) => <MemoryRouter><DataProvider sources={sources}>{children}</DataProvider></MemoryRouter>,
  });
  const labels = result.current.flatMap((item) => item === 'sep' ? [] : [item.label]);
  expect(labels).not.toContain('New note');
  expect(labels).toContain('New folder');
  expect(labels).toContain('Rename');
});
