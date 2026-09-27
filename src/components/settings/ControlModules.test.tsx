// The Appearance and Visualizer modules' shortcuts into /control.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { AppearanceModule, VisualizerModule } from './ControlModules';
import { useSettings } from '../../stores/settingsStore';
import { useThemes } from '../../stores/themeStore';
import { BUILTIN_THEMES } from '../../services/themes/builtin';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { MY_LIQUE } from '../../services/storage/scope';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderModules() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <AppearanceModule />
            <VisualizerModule />
          </>
        ),
      },
      { path: '/control/:section', element: <Where /> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const panel = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: true, profileScope: MY_LIQUE });
  useThemes.setState({ scope: MY_LIQUE, themes: [...BUILTIN_THEMES] });
});
afterEach(cleanup);

describe('Appearance module shortcut', () => {
  it('has the same icon shortcut as Visualizer, in its header', () => {
    renderModules();
    const appearance = within(panel('Appearance')).getByRole('link', { name: 'More theme settings' });
    const visualizer = within(panel('Visualizer')).getByRole('link', { name: 'More visualizer settings' });
    expect(appearance.className).toBe(visualizer.className); // same styling classes
    expect(appearance.getAttribute('title')).toBe('More theme settings');
    expect(appearance.closest('.control-module__header')).not.toBeNull();
    expect(appearance.querySelector('svg')?.getAttribute('class')).toBe(visualizer.querySelector('svg')?.getAttribute('class')); // the same icon
    expect(appearance.querySelector('svg')?.getAttribute('width')).toBe('14');
  });

  it('opens Control › Themes; the Visualizer shortcut still opens Control › Visualizers', async () => {
    const router = renderModules();
    await act(async () => fireEvent.click(within(panel('Appearance')).getByRole('link', { name: 'More theme settings' })));
    expect(router.state.location.pathname).toBe('/control/themes');
    await act(() => router.navigate('/'));
    await act(async () => fireEvent.click(within(panel('Visualizer')).getByRole('link', { name: 'More visualizer settings' })));
    expect(router.state.location.pathname).toBe('/control/visualizers');
  });

  it('is reachable with the keyboard (a focusable link) and only the icon navigates', () => {
    renderModules();
    const link = within(panel('Appearance')).getByRole('link', { name: 'More theme settings' });
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(within(panel('Appearance')).getAllByRole('link')).toHaveLength(1);
  });

  it('the theme selector and glow work exactly as before', () => {
    const router = renderModules();
    const nord = BUILTIN_THEMES.find((t) => t.id === 'base16-nord')!;
    fireEvent.change(within(panel('Appearance')).getByLabelText('Theme'), { target: { value: nord.id } });
    expect(useSettings.getState().activeThemeId).toBe(nord.id);
    fireEvent.click(within(panel('Appearance')).getByRole('radio', { name: 'High' }));
    expect(useSettings.getState().glowLevel).toBe(1.5);
    expect(router.state.location.pathname).toBe('/'); // no navigation
  });
});
