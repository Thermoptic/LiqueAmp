import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { LIBRARY_SECTIONS, sectionFromPath } from './sections';
import { useUi, type LibraryTab } from '../stores/uiStore';
import { Header } from '../components/layout/Header';
import { StatusBar } from '../components/layout/StatusBar';
import { Sidebar } from '../components/navigation/Sidebar';
import { BottomNav } from '../components/navigation/BottomNav';
import { NowPlayingPanel } from '../components/player/NowPlayingPanel';
import { QuickActionsPanel } from '../components/player/QuickActionsPanel';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { RadioBrowserPanel } from '../components/radio/RadioBrowserPanel';
import { StationInfoPanel } from '../components/radio/StationInfoPanel';
import { LibraryPanel } from '../components/library/LibraryPanel';
import { QueuePanel } from '../components/queue/QueuePanel';
import { ControlStrip } from '../components/settings/ControlModules';
import { SettingsPanel } from '../components/settings/SettingsPanel';

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

  useEffect(() => {
    if (LIBRARY_SECTIONS.has(section)) setLibraryTab(section as LibraryTab);
  }, [section, setLibraryTab]);

  return (
    <div className="app-frame" data-section={section}>
      <div className="dashboard">
        <Header />
        <Sidebar />
        {section === 'settings' ? <SettingsPanel /> : <NowPlayingPanel />}
        <RadioBrowserPanel focusSearch={section === 'browse'} />
        <div className="lower area-lower">
          <LibraryPanel />
          <QueuePanel />
          <StationInfoPanel />
          <QuickActionsPanel />
        </div>
        <ControlStrip />
        <StatusBar />
      </div>
      {section !== 'now-playing' && section !== 'settings' && (
        <div className="mobile-only mobile-mini">
          <MiniPlayer />
        </div>
      )}
      <BottomNav />
    </div>
  );
}
