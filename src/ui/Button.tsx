import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import s from './ui.module.css';
import { hintCls } from './hint';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The button element itself (React 19 passes `ref` as a prop), e.g. to move focus to it. */
  ref?: Ref<HTMLButtonElement>;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', block, className = '', children, type = 'button', ...rest }: Props) {
  const cls = [s.btn, s[variant], size === 'sm' ? s.small : '', block ? s.block : '', className].join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  small?: boolean;
  children: ReactNode;
}

/** A square button with only an icon; `label` is its accessible name, shown as its hint. */
export function IconButton({ label, small, className = '', children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} className={`${s.iconBtn} ${hintCls} ${small ? s.sm : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** A link that looks like the main button (opening a web page is a link, not an action). */
export const buttonLinkClass: string = [s.btn, s.primary].join(' ');
