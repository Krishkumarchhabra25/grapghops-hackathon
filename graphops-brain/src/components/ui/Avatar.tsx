import { cx } from '../../lib/utils';

type Props = {
  name?: string;
  initials?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
};

export function Avatar({ name = 'User', initials, color = '#a78bfa', size = 'md' }: Props) {
  const letters = initials || name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sizeCls = size === 'sm' ? 'h-7 w-7 text-[9px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-[11px]';
  return (
    <div style={{ background: color }} className={cx('flex shrink-0 items-center justify-center rounded-full font-bold text-[#111821]', sizeCls)}>
      {letters}
    </div>
  );
}