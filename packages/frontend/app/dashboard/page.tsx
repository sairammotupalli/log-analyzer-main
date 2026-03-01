import { api } from '@/lib/api';
import { FileUploader } from '@/components/upload/FileUploader';
import type { LogUpload } from '@/types';
import { UploadsTable } from '@/components/dashboard/UploadsTable';

interface UploadsResponse {
  success: boolean;
  data: {
    uploads:    LogUpload[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  };
}

export const dynamic  = 'force-dynamic';
export const metadata = { title: 'Dashboard — SOC Log Analyzer' };

export default async function DashboardPage() {
  let uploads: LogUpload[] = [];
  try {
    const res = await api.get<UploadsResponse>('/api/uploads?limit=50');
    uploads = res.data?.uploads ?? [];
  } catch {
    // Not fatal — empty state is shown instead
  }

  return (
    <div className="space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload a ZScaler proxy log file to start analysis.
        </p>
      </div>

      {/* Uploader */}
      <FileUploader />

      {/* Upload history */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-800">
          Previous Uploads
          {uploads.length > 0 && (
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
              {uploads.length}
            </span>
          )}
        </h2>

        {uploads.length === 0 ? (
          <p className="text-sm text-gray-400">No uploads yet. Try uploading a log file above.</p>
        ) : (
          <UploadsTable uploads={uploads} />
        )}
      </section>
    </div>
  );
}
