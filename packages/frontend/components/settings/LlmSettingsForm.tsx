'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { makeClientApi } from '@/lib/api';

type Provider = 'anthropic' | 'openai' | 'deepseek' | 'llama' | 'custom';

export function LlmSettingsForm(props: {
  initial: null | { provider: string; model: string | null; baseUrl: string | null; hasApiKey: boolean };
}) {
  const { data: session } = useSession();
  const token = session?.backendToken || '';
  const api = useMemo(() => makeClientApi(token), [token]);

  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    const init = props.initial;
    if (!init) return;
    const p = (init.provider || 'anthropic').toLowerCase() as Provider;
    setProvider(p);
    setModel(init.model || '');
    setBaseUrl(init.baseUrl || '');
    setHasApiKey(Boolean(init.hasApiKey));
  }, [props.initial]);

  async function fetchConfigForProvider(p: Provider) {
    if (!token) return;
    setTestStatus('idle');
    setTestMessage('');
    try {
      const res = await api.get<{ success: boolean; data?: { config?: { provider?: string; model?: string | null; baseUrl?: string | null; hasApiKey?: boolean } } }>(`/api/llm-config?provider=${p}`);
      const cfg = res?.data?.config;
      if (cfg) {
        setModel(cfg.model || '');
        setBaseUrl(cfg.baseUrl || '');
        setHasApiKey(Boolean(cfg.hasApiKey));
      } else {
        setModel('');
        setBaseUrl('');
        setHasApiKey(false);
      }
    } catch {
      setModel('');
      setBaseUrl('');
      setHasApiKey(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    setTestStatus('idle');
    setTestMessage('');

    const isCustom = provider === 'custom';
    const needsModel = isCustom && !model.trim();
    const needsBaseUrl = isCustom && !baseUrl.trim();
    const needsApiKey = isCustom && !hasApiKey && !apiKey.trim();
    if (needsModel || needsBaseUrl || needsApiKey) {
      setStatus('error');
      const missing: string[] = [];
      if (needsModel) missing.push('model name');
      if (needsBaseUrl) missing.push('base URL');
      if (needsApiKey) missing.push('API key');
      setMessage('Custom provider requires: ' + missing.join(', '));
      setTimeout(() => setStatus('idle'), 2500);
      return;
    }

    try {
      const res = await api.put<{ success: boolean; data?: any; error?: any }>('/api/llm-config', {
        provider,
        model: model || null,
        baseUrl: baseUrl || null,
        apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined,
      });

      if (!res.success) throw new Error(res?.error?.message || 'Failed to save');

      setStatus('idle');
      setHasApiKey(true);
      setApiKey('');
      setMessage('Saved.');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Error saving settings');
      setTimeout(() => setStatus('idle'), 2500);
    }
  }

  async function onTest() {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const res = await api.post<{ success: boolean; data?: { reply?: string }; error?: { message?: string } }>(
        '/api/llm-config/test',
        {},
      );
      if (res.success) {
        setTestStatus('ok');
        setTestMessage(`Connected. Response: "${res.data?.reply ?? 'OK'}"`);
      } else {
        setTestStatus('fail');
        setTestMessage(res.error?.message || 'Connection failed');
      }
    } catch (err: any) {
      setTestStatus('fail');
      setTestMessage(err?.message || 'Connection failed');
    }
  }

  async function onClearKey() {
    setMessage('');
    try {
      const res = await api.put<{ success: boolean; data?: any; error?: any }>('/api/llm-config', {
        provider,
        clearKeyOnly: true,
      });
      if (!res.success) throw new Error(res?.error?.message || 'Failed to clear key');
      setHasApiKey(false);
      setApiKey('');
      setMessage('API key cleared.');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Error clearing key');
      setTimeout(() => setStatus('idle'), 2500);
    }
  }

  function getBaseUrlPlaceholder(): string {
    if (provider === 'llama') return 'http://ollama:11434  (local: http://localhost:11434)';
    if (provider === 'custom') return 'https://your-api.com/v1';
    if (provider === 'deepseek') return 'https://api.deepseek.com';
    if (provider === 'openai') return 'https://api.openai.com';
    return '';
  }

  function getBaseUrlTip(): string {
    if (provider === 'llama') {
      return 'Docker Compose: use http://ollama:11434 — Ollama is included and starts automatically.';
    }
    return 'Paste the host (or /v1), not the full /chat/completions URL.';
  }

  function getModelPlaceholder(): string {
    if (provider === 'anthropic') return 'claude-sonnet-4-6';
    if (provider === 'openai') return 'gpt-4o-mini';
    if (provider === 'deepseek') return 'deepseek-reasoner';
    if (provider === 'llama') return 'llama3.2';
    return 'e.g. gpt-4o-mini';
  }

  const isBusy = status === 'saving' || testStatus === 'testing';

  return (
    <form onSubmit={onSave} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Provider</label>
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value as Provider;
              setProvider(p);
              fetchConfigForProvider(p);
            }}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="deepseek">DeepSeek (R1)</option>
            <option value="llama">Llama / Ollama</option>
            <option value="custom">Custom (OpenAI-compatible)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            API key: {hasApiKey ? 'set' : 'not set'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Model</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={getModelPlaceholder()}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Base URL (optional)</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={getBaseUrlPlaceholder()}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
        <p className="mt-1 text-xs text-gray-500">{getBaseUrlTip()}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasApiKey ? 'Leave blank to keep current key' : 'Paste your API key'}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
        <p className="mt-1 text-xs text-gray-500">
          Stored encrypted in Postgres. Leave blank to keep your current key.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={!token || isBusy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>

          <button
            type="button"
            onClick={onClearKey}
            disabled={!token || isBusy || !hasApiKey}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Clear key
          </button>

          <button
            type="button"
            onClick={onTest}
            disabled={!token || isBusy}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </button>

          {message && (
            <span className={'text-sm ' + (status === 'error' ? 'text-red-600' : 'text-green-600')}>
              {message}
            </span>
          )}
        </div>

        {testMessage && (
          <p className={
            'text-xs rounded-md px-3 py-2 ' +
            (testStatus === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')
          }>
            {testStatus === 'ok' ? '✓ ' : '✗ '}{testMessage}
          </p>
        )}
      </div>
    </form>
  );
}
