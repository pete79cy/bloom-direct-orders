import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

/**
 * Pairs with `registerType: 'autoUpdate'` in vite.config.ts. The new SW
 * activates on its own (skipWaiting + clientsClaim), so we don't NEED a
 * user-driven Refresh button anymore. But the bundles in memory are still
 * the old ones until the page reloads, so the user would not see the new
 * UI until they happen to navigate. We force a one-shot location.reload()
 * here so the update lands the instant the SW takes control.
 *
 * The toast is informational only — a brief "Νέα έκδοση φορτώθηκε" so the
 * user understands why the screen blinked. No required interaction.
 */
export default function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      // eslint-disable-next-line no-console
      console.log('SW registered:', swUrl);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast.success('Νέα έκδοση φορτώθηκε', { duration: 2200 });
    setNeedRefresh(false);
    // Tiny delay so the toast renders before the reload erases it. The
    // reload picks up the freshly-activated SW's precached bundles.
    const t = window.setTimeout(() => window.location.reload(), 400);
    return () => window.clearTimeout(t);
  }, [needRefresh, setNeedRefresh]);

  return null;
}
