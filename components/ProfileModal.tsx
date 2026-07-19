import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { Copy, Loader2, Shield, UserCog, X } from 'lucide-react';
import { updateDisplayName } from '../services/firebaseAuth';

interface ProfileModalProps {
  user: User;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, open, onClose, onSignOut }) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(user.displayName || '');
      setFeedback(null);
    }
  }, [open, user.displayName]);

  if (!open) {
    return null;
  }

  const providerLabel = user.providerData[0]?.providerId === 'google.com'
    ? 'Google account'
    : user.providerData[0]?.providerId === 'apple.com'
      ? 'Apple account'
      : 'Email/password';

  const avatar = user.photoURL || '';
  const initials = (user.displayName || user.email || 'U')
    .split(' ')
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      await updateDisplayName(displayName.trim() || user.displayName || user.email || 'User');
      setFeedback('Profile updated.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setFeedback(`${label} copied.`);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 sm:px-6">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-neutral-500">Profile options</div>
            <h2 className="mt-2 text-2xl font-semibold text-black">Your account</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-neutral-200 bg-neutral-50 p-6 md:border-b-0 md:border-r">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-2xl font-semibold text-neutral-700">
                {avatar ? <img src={avatar} alt={user.displayName || user.email || 'User'} className="h-full w-full object-cover" /> : initials}
              </div>
              <div>
                <div className="text-lg font-semibold text-black">{user.displayName || 'User'}</div>
                <div className="text-sm text-neutral-600">{user.email}</div>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-white">
                  <Shield className="h-3.5 w-3.5" /> {providerLabel}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">

              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">Connected providers</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {user.providerData.map(provider => (
                    <span key={provider.providerId} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                      {provider.providerId}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-7">
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">Display name</div>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 focus-within:border-black">
                  <UserCog className="h-4 w-4 text-neutral-400" />
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full bg-transparent outline-none"
                    placeholder="Enter a display name"
                  />
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save profile
                </button>
              </div>

              <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">Account options</div>
                <div className="mt-3 space-y-2 text-sm text-neutral-700">
                  <div className="rounded-2xl bg-white px-4 py-3">Manage your sign-in method</div>
                  <div className="rounded-2xl bg-white px-4 py-3">Review connected devices</div>
                  <div className="rounded-2xl bg-white px-4 py-3">Update security settings</div>
                </div>
              </div>

              {feedback && <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">{feedback}</div>}

              <div className="flex flex-wrap gap-3 pt-2">
                <button onClick={onClose} className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black">
                  Close
                </button>
                <button onClick={onSignOut} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:border-red-300">
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;