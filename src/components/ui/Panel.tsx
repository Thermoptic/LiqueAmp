import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  titleVariant?: 'default' | 'accent' | 'small';
  icon?: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  strong?: boolean;
  labelledBy?: string;
  children?: ReactNode;
}

export function Panel({
  title,
  titleVariant = 'default',
  icon,
  actions,
  header,
  className = '',
  bodyClassName = '',
  flush,
  strong,
  labelledBy,
  children,
}: PanelProps) {
  const titleClass =
    titleVariant === 'accent' ? 'panel__title panel__title--accent' : titleVariant === 'small' ? 'panel__title panel__title--small' : 'panel__title';
  return (
    <section className={`panel ${strong ? 'panel--strong' : ''} ${className}`} aria-labelledby={labelledBy}>
      {header ??
        (title !== undefined && (
          <header className="panel__header">
            {icon}
            <h2 className={titleClass} id={labelledBy}>
              {title}
            </h2>
            {actions && <div className="panel__actions">{actions}</div>}
          </header>
        ))}
      <div className={`panel__body ${flush ? 'panel__body--flush' : ''} ${bodyClassName}`}>{children}</div>
    </section>
  );
}
