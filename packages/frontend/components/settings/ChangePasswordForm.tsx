'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { makeClientApi } from '@/lib/api';
import { Lock } from 'lucide-react';

export function ChangePasswordForm() {
  const { data: session } = useSession();
  const token = session?.backendToken || '';
  const api = useMemo(() => makeClientApi(token), [token]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');

    if (newPassword.length < 8) {
      setStatus('error');
      setMessage('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('New passwords do not match');
      return;
    }

    setStatus('saving');
    try {
      await api.post<{ success: boolean }>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setStatus('success');
      setMessage('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to change password');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 max-w-md"
    >
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600"
          placeholder="Enter current password"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Confirm new password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600"
          placeholder="Re-enter new password"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!token || status === 'saving'}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'saving' ? 'Updating…' : 'Update password'}
        </button>
        {message && (
          <span
            className={`text-sm ${status === 'error' ? 'text-red-600' : status === 'success' ? 'text-green-600' : 'text-gray-600'}`}
          >
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
