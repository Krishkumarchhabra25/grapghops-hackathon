import { Search, X } from 'lucide-react';
import { cx } from '../../lib/utils';

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchBox({ value, onChange, placeholder = 'Search…', className = '' }: Props) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        className="input !pl-9 !py-[9px] text-xs"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
          <X size={13} />
        </button>
      )}
    </div>
  );
}