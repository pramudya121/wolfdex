import { type ReactNode } from 'react';

/** Magic UI BorderBeam — wraps children with an animated conic-gradient border. */
export default function BorderBeam({
  children,
  className = '',
  rounded = 'rounded-2xl',
}: {
  children: ReactNode;
  className?: string;
  rounded?: string;
}) {
  return (
    <div className={`relative border-beam ${rounded} ${className}`}>
      {children}
    </div>
  );
}
