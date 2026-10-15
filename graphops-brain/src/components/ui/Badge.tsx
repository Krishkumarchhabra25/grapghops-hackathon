import { cx } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'green' | 'red' | 'yellow' | 'blue' | 'purple';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: '',
  green: 'badge-green',
  red: 'badge-red',
  yellow: 'badge-yellow',
  blue: 'badge-blue',
  purple: 'badge-purple',
};

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: BadgeTone }) {
  return <span className={cx('badge', TONE_CLASS[tone])}>{children}</span>;
}