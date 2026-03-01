import { cn } from '@/lib/utils';
import type { UploadStatus } from '@/types';

const map: Record<UploadStatus, { label: string; className: string }> = {
  PENDING:   { label: 'Pending',   className: 'bg-gray-100  text-gray-700'   },
  PARSING:   { label: 'Parsing',   className: 'bg-amber-100 text-amber-700'  },
  ANALYZING: { label: 'Analyzing', className: 'bg-blue-100  text-blue-700'   },
  COMPLETE:  { label: 'Complete',  className: 'bg-green-100 text-green-700'  },
  FAILED:    { label: 'Failed',    className: 'bg-red-100   text-red-700'    },
};

export function StatusBadge({ status }: { status: UploadStatus }) {
  const { label, className } = map[status] ?? map.PENDING;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>
      {label}
    </span>
  );
}
