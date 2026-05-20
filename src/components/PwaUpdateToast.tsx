import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

export default function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      console.log('SW registered:', swUrl);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast('Διαθέσιμη νέα έκδοση', {
      action: {
        label: 'Refresh',
        onClick: () => {
          void updateServiceWorker(true);
          setNeedRefresh(false);
        },
      },
      duration: Infinity,
    });
  }, [needRefresh, updateServiceWorker, setNeedRefresh]);

  return null;
}
