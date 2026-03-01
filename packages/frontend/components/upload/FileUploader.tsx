'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export function FileUploader() {
  const router = useRouter();
  const { data: session } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!session?.backendToken) {
        setError('Not authenticated');
        return;
      }

      setIsUploading(true);
      setError(null);

      try {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch(`${BACKEND}/api/uploads`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${session.backendToken}` },
          body:    form,
          // No Content-Type — browser sets multipart boundary automatically
        });

        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? 'Upload failed');

        const uploadId: string = body.data.id;
        router.push(`/dashboard/${uploadId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setIsUploading(false);
      }
    },
    [session, router],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so the same file can be selected again on the next upload.
      e.target.value = '';
      if (file) upload(file);
    },
    [upload],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isUploading && inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
        isDragging
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40',
        isUploading && 'pointer-events-none opacity-70',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".log,.csv,.txt"
        className="sr-only"
        onChange={handleChange}
        disabled={isUploading}
      />

      {isUploading ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-gray-700">Uploading…</p>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            {isDragging ? (
              <FileText className="h-7 w-7 text-blue-600" />
            ) : (
              <Upload className="h-7 w-7 text-blue-600" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">
              {isDragging ? 'Drop to upload' : 'Drag & drop your ZScaler log file'}
            </p>
            <p className="mt-1 text-xs text-gray-500">or click to browse · .log, .csv, .txt · max 50 MB</p>
          </div>
        </>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
