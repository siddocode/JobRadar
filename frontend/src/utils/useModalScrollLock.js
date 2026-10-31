import { useEffect } from 'react';

/**
 * useModalScrollLock Hook
 * Automatically locks background body and html scrolling when a modal is mounted/open.
 * Uses a reference counter on document.body so stacked or nested modals don't prematurely unlock scroll.
 */
export function useModalScrollLock(isOpen = true) {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const currentCount = parseInt(document.body.getAttribute('data-modal-count') || '0', 10);
    const newCount = currentCount + 1;
    document.body.setAttribute('data-modal-count', String(newCount));

    if (newCount === 1) {
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
    }

    return () => {
      const activeCount = parseInt(document.body.getAttribute('data-modal-count') || '1', 10);
      const updatedCount = Math.max(0, activeCount - 1);
      if (updatedCount === 0) {
        document.body.removeAttribute('data-modal-count');
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
      } else {
        document.body.setAttribute('data-modal-count', String(updatedCount));
      }
    };
  }, [isOpen]);
}

export default useModalScrollLock;
