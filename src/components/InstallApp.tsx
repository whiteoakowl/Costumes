import { useState } from 'react';
import { Download, PlusSquare, RefreshCw, Share, WifiOff } from 'lucide-react';
import { Modal } from './Modal';
import { promptInstall, usePwa } from '../lib/pwa';

/**
 * "Install app" button. Android / Chrome / Edge get the one-tap install dialog;
 * iPhone and iPad (where Apple allows no install button) get Add to Home Screen steps.
 * Hidden when the app is already installed or the browser can't install it.
 */
export function InstallAppButton({ compact }: { compact?: boolean }) {
  const pwa = usePwa();
  const [showIos, setShowIos] = useState(false);
  if (pwa.installed || (!pwa.canPrompt && !pwa.ios)) return null;

  const onClick = () => {
    if (pwa.canPrompt) void promptInstall();
    else setShowIos(true);
  };

  return (
    <>
      {compact ? (
        <button className="btn btn-ghost btn-sm install-btn-compact" onClick={onClick} aria-label="Install app">
          <Download size={16} /> Install
        </button>
      ) : (
        <button className="install-btn" onClick={onClick}>
          <img src="./icons/icon-192.png" alt="" width={32} height={32} />
          <span>
            <strong>Install app</strong>
            <span className="install-sub">{pwa.ios ? 'Add to your Home Screen' : 'Opens full-screen, like an app'}</span>
          </span>
          <Download size={16} />
        </button>
      )}
      <Modal open={showIos} onClose={() => setShowIos(false)} title="Add to Home Screen" subtitle="Install Dance Studio & Costumes on your iPhone or iPad" size="sm">
        <ol className="ios-steps">
          <li>
            <span className="ios-step-icon">
              <Share size={18} />
            </span>
            <span>
              Tap the <strong>Share</strong> button in Safari's toolbar (the square with an arrow pointing up). On iPhone it's at the bottom of the screen; on iPad it's at the top.
            </span>
          </li>
          <li>
            <span className="ios-step-icon">
              <PlusSquare size={18} />
            </span>
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </span>
          </li>
          <li>
            <span className="ios-step-icon">
              <img src="./icons/apple-touch-icon.png" alt="" width={22} height={22} />
            </span>
            <span>
              Tap <strong>Add</strong>. The Dance Studio icon appears on your Home Screen and opens full-screen.
            </span>
          </li>
        </ol>
        <p className="muted small">Don't see Add to Home Screen? Open this page in Safari first, then try again.</p>
      </Modal>
    </>
  );
}

/** Slim notices for "you're offline" and "a new version is ready". */
export function AppStatusBanners() {
  const pwa = usePwa();
  return (
    <>
      {!pwa.online && (
        <div className="status-banner status-offline" role="status">
          <WifiOff size={15} />
          <span>You're offline. You can keep working: changes are saved on this device.</span>
        </div>
      )}
      {pwa.updateReady && (
        <div className="status-banner status-update" role="status">
          <RefreshCw size={15} />
          <span>A new version of the app is ready.</span>
          <button className="btn btn-primary btn-sm" onClick={() => location.reload()}>
            Refresh
          </button>
        </div>
      )}
    </>
  );
}
