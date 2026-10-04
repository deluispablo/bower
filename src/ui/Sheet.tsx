import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import s from './ui.module.css';
import { useBackCloses } from './back';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Visually hide the title (it still names the dialog). */
  hideTitle?: boolean;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** A bottom sheet on a phone, a centred dialog on a desktop. */
export function Sheet({ open, onOpenChange, title, hideTitle, description, children, className = '' }: Props) {
  useBackCloses(open, () => onOpenChange(false));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.scrim} />
        {/* With no description, say so (aria-describedby undefined) rather than repeat the title. */}
        <Dialog.Content className={`${s.sheet} ${className}`} {...(description ? {} : { 'aria-describedby': undefined })}>
          <div className={s.grab} aria-hidden="true" />
          <Dialog.Title className={hideTitle ? 'sr-only' : s.sheetTitle}>{title}</Dialog.Title>
          {description && <Dialog.Description className="muted">{description}</Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
