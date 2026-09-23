import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { Dashboard } from './Dashboard';

// /control (theme import with the YAML parser, diagnostics, management) is
// loaded only when opened, so it does not slow down the player's start-up.
const ControlPage = lazy(() => import('../components/control/ControlPage').then((m) => ({ default: m.ControlPage })));

// All dashboard paths share one element so switching sections never remounts
// the dashboard. /control is a separate page.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Dashboard />,
    children: [
      { index: true, element: null },
      { path: 'browse', element: null },
      { path: 'playlists', element: null },
      { path: 'favourites', element: null },
      { path: 'history', element: null },
      { path: 'settings', element: null },
    ],
  },
  {
    path: '/control/:section?',
    element: (
      <Suspense fallback={<p className="control-loading">LOADING CONTROL…</p>}>
        <ControlPage />
      </Suspense>
    ),
  },
  { path: '*', element: <Dashboard /> },
]);
