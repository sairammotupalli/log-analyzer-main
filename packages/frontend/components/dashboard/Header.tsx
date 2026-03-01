'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { ShieldCheck, LogOut, User, Settings } from 'lucide-react';

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-gray-900">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <span>SOC Log Analyzer</span>
        </Link>

        {/* User menu */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{session?.user?.email}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
