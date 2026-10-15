import { cx } from '../../lib/utils';

type Props = { checked: boolean; onChange: (v: boolean) => void };

export function Switch({ checked, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[22px] w-[39px] shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-lime bg-lime/20' : 'border-[#3a4655] bg-[#222c38]',
      )}
    >
      <span className={cx('h-[14px] w-[14px] rounded-full transition-all', checked ? 'translate-x-[20px] bg-lime' : 'translate-x-[4px] bg-slate-500')} />
    </button>
  );
}