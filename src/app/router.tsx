import { createBrowserRouter } from 'react-router';
import { Dashboard } from './Dashboard';
import { ControlPage } from '../components/control/ControlPage';

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
  { path: '/control/:section?', element: <ControlPage /> },
  { path: '*', element: <Dashboard /> },
]);
