import { api } from '@/lib/api';
import { LlmSettingsForm } from '@/components/settings/LlmSettingsForm';
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — SOC Log Analyzer' };

type ConfigResponse = {
  success: boolean;
  data: {
    config: null | {
      provider: string;
      model: string | null;
      baseUrl: string | null;
      hasApiKey: boolean;
    };
  };
};

type MeResponse = {
  success: boolean;
  data: { user: { hasPassword?: boolean } };
};

export default async function SettingsPage() {
  let config: ConfigResponse['data']['config'] = null;
  let hasPassword = false;

  try {
    const [configRes, meRes] = await Promise.all([
      api.get<ConfigResponse>('/api/llm-config'),
      api.get<MeResponse>('/api/auth/me'),
    ]);
    config = configRes.data.config;
    hasPassword = meRes.data?.user?.hasPassword ?? false;
  } catch {
    // ignore — form will show defaults
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your LLM configuration and account.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">LLM Settings</h2>
        <p className="text-sm text-gray-500 mb-4">
          Choose which model to use for AI enrichment and summaries. Your API key is stored encrypted in the database.
        </p>
        <LlmSettingsForm initial={config} />
      </section>

      {hasPassword && (
        <section>
          <ChangePasswordForm />
        </section>
      )}
    </div>
  );
}

