import { useEffect } from 'react';
import { toast, ToastContainer } from 'bang-inventory-ui';

export function Default() {
  useEffect(() => {
    toast.success('Batch BW-1042 marked as completed');
    toast.error('Failed to save lot LOT-0093');
    toast.info('Sync with warehouse in progress…');
  }, []);
  return <ToastContainer />;
}
