import type { CSSProperties, ReactNode } from 'react';
import ui from './ui.module.css';

/**
 * Still shapes in the place and size of what is on its way, so nothing moves when it lands
 * (web.dev/articles/optimize-cls; NN/g skeleton screens). One status, named for what opens. No motion.
 */
export function Skeleton({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <span role="status" aria-label={label} className={className}>
      {children}
    </span>
  );
}

/** One still shape. Its size is the caller's: the line, row or control it stands for. */
export function Bone({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={className ? `${ui.bone} ${className}` : ui.bone} style={style} />;
}
