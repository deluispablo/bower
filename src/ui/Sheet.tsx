import * as Dialog from '@radix-ui/react-dialog';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import s from './ui.module.css';
import { useBackCloses } from './back';
import { closeFocus, focusRouteHeading, openerNow } from './focus';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Visually hide the title (it still names the dialog). */
  hideTitle?: boolean;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Edge panels share the dialog's dismissal and focus behaviour. */
  placement?: 'left' | 'right';
  /** Suppress edge-panel motion; other placements keep their existing animation. */
  still?: boolean;
  style?: CSSProperties;
  overlayStyle?: CSSProperties;
  /** Navigation dismisses an edge panel to the new page's heading. */
  navigation?: boolean;
}

/** A bottom sheet on a phone, a centred dialog on a desktop. */
export function Sheet({ open, onOpenChange, title, hideTitle, description, children, className = '', placement, still = false, style, overlayStyle, navigation }: Props) {
  const noSlide = placement !== undefined && still;
  useBackCloses(open, () => onOpenChange(false));
  // The control that held the keyboard when the sheet opened; read before the sheet takes it.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = openerNow();
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.scrim} style={{ ...overlayStyle, ...(noSlide ? { animation: 'none' } : {}) }} />
        {/* With no description, say so (aria-describedby undefined) rather than repeat the title. */}
        <Dialog.Content
          className={`${s.sheet} ${placement ? `${s.edgeSheet} ${placement === 'left' ? s.edgeLeft : s.edgeRight}` : ''} ${className}`}
          style={{ ...style, ...(noSlide ? { animation: 'none' } : {}) }}
          {...(description ? {} : { 'aria-describedby': undefined })}
          // Back to what opened it; when that is gone (a sheet opened by the app), to the page's heading.
          onCloseAutoFocus={(e) => {
            if (navigation) {
              e.preventDefault();
              // The route may still be loading: use the existing rule after the modal has gone.
              focusRouteHeading();
            } else closeFocus(e, opener.current);
          }}
        >
          {!placement && <div className={s.grab} aria-hidden="true" />}
          <Dialog.Title className={hideTitle ? 'sr-only' : s.sheetTitle}>{title}</Dialog.Title>
          {description && <Dialog.Description className="muted">{description}</Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
