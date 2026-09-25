import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { takeAuthReturnPath, useAccount } from '../stores/accountStore';
import { UsernameSetupDialog } from '../components/settings/UsernameSetupDialog';
import { SetNewPasswordDialog } from '../components/settings/EmailAuthDialog';
import { LIBRARY_SECTIONS, sectionFromPath } from './sections';
import { useUi, type LibraryTab } from '../stores/uiStore';
import { Header } from '../components/layout/Header';
import { StatusBar } from '../components/layout/StatusBar';
import { Sidebar } from '../components/navigation/Sidebar';
import { BottomNav } from '../components/navigation/BottomNav';
import { NowPlayingPanel } from '../components/player/NowPlayingPanel';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { RadioBrowserPanel } from '../components/radio/RadioBrowserPanel';
import { StationInfoPanel } from '../components/radio/StationInfoPanel';
import { FriendLiquesPanel } from '../components/friends/FriendLiquesPanel';
import { LibraryPanel } from '../components/library/LibraryPanel';
import { QueuePanel } from '../components/queue/QueuePanel';
import { AppearanceModule, AudioModule, PlayerModule, VisualizerModule } from '../components/settings/ControlModules';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { SkipLink } from '../components/layout/SkipLink';

/**
 * One layout for every screen size (ARCH §37). The route only chooses which
 * regions are emphasised; on narrow screens CSS shows the regions that belong
 * to the current section. Playback does not live here, so navigating never
 * interrupts it.
 */
export function Dashboard() {
  const { pathname } = useLocation();
  const section = sectionFromPath(pathname);
  const setLibraryTab = useUi((s) => s.setLibraryTab);
  const navigate = useNavigate();
  const accountLoading = useAccount((s) => s.loading);

  // Back from Google/GitHub (<base>/auth/callback): once the session is
  // settled, return to where sign-in started, without the code in the URL.
  useEffect(() => {
    if (pathname === '/auth/callback' && !accountLoading) navigate(takeAuthReturnPath(), { replace: true });
  }, [pathname, accountLoading, navigate]);

  useEffect(() => {
    if (LIBRARY_SECTIONS.has(section)) setLibraryTab(section as LibraryTab);
  }, [section, setLibraryTab]);

  return (
    <div className="app-frame" data-section={section}>
      <SkipLink targetId="main-content" />
      <div className="dashboard">
        <Header />
        <Sidebar />
        {/* display: contents — a landmark without changing the dashboard grid */}
        <main id="main-content" className="dashboard__main">
          <h1 className="sr-only">LIQUEAMP player</h1>
          {section === 'settings' ? <SettingsPanel /> : <NowPlayingPanel />}
          <RadioBrowserPanel focusSearch={section === 'browse'} />
          {/* under the sidebar, same width as the Library column */}
          <AudioModule />
          {/* Library spans both lower rows; the settings modules sit under the other three panels.
              The fourth panel slot (.area-actions, next to Station Info) is FRIEND LIQUES. */}
          <div className="lower area-lower">
            <LibraryPanel />
            <QueuePanel />
            <StationInfoPanel />
            <FriendLiquesPanel />
            <PlayerModule />
            <AppearanceModule />
            <VisualizerModule />
          </div>
        </main>
        <StatusBar />
      </div>
      {section !== 'now-playing' && section !== 'settings' && (
        <div className="mobile-only mobile-mini">
          <MiniPlayer />
        </div>
      )}
      <BottomNav />
      <UsernameSetupDialog />
      <SetNewPasswordDialog />
    </div>
  );
}
