

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Icon from './Icon';
import { User, ScrollState } from '../types';
import { geminiService } from '../services/geminiService';
import { getTtsPrompt } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../i18n';

interface SettingsScreenProps {
  currentUser: User;
  onUpdateSettings: (settings: Partial<User>) => Promise<void>;
  onUnblockUser: (user: User) => void;
  onDeactivateAccount: () => void;
  lastCommand: string | null;
  onSetTtsMessage: (message: string) => void;
  scrollState: ScrollState;
  onCommandProcessed: () => void;
  onGoBack: () => void;
  field?: string;
  value?: string;
}

const ToggleSwitch: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void }> = ({ enabled, onChange }) => {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`${
        enabled ? 'bg-fuchsia-600' : 'bg-slate-600'
      } relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
    >
      <span
        className={`${
          enabled ? 'translate-x-6' : 'translate-x-1'
        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
      />
    </button>
  );
};

const SettingsSection: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
        <h2 className="text-xl font-bold text-slate-100">{title}</h2>
        {description && <p className="text-sm text-slate-400 mt-1 mb-4">{description}</p>}
        <div className="mt-4 space-y-4">{children}</div>
    </div>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ currentUser, onUpdateSettings, onUnblockUser, onDeactivateAccount, lastCommand, onSetTtsMessage, onCommandProcessed, onGoBack }) => {
    const [name, setName] = useState(currentUser.name);
    const [bio, setBio] = useState(currentUser.bio);
    const [privacySettings, setPrivacySettings] = useState(currentUser.privacySettings);
    const [notificationSettings, setNotificationSettings] = useState(currentUser.notificationSettings || {});
    const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
    
    useEffect(() => {
        const fetchBlockedUsers = async () => {
            if (currentUser.blockedUserIds && currentUser.blockedUserIds.length > 0) {
                const users = await geminiService.getUsersByIds(currentUser.blockedUserIds);
                setBlockedUsers(users);
            }
        };
        fetchBlockedUsers();
    }, [currentUser.blockedUserIds]);

    const handleSaveChanges = useCallback(async () => {
        onSetTtsMessage("Saving settings...");
        await onUpdateSettings({
            name,
            bio,
            privacySettings,
            notificationSettings,
        });
        onSetTtsMessage("Your settings have been saved.");
    }, [onSetTtsMessage, onUpdateSettings, name, bio, privacySettings, notificationSettings]);
    
    useEffect(() => {
        const handleCommand = async () => {
            if (!lastCommand) return;
            // FIX: Use geminiService.processIntent to handle the command
// FIX: Added missing context object to `geminiService.processIntent` call.
            const intentResponse = await geminiService.processIntent(lastCommand, {});
            if(intentResponse.intent === 'intent_save_settings') {
                handleSaveChanges();
            }
            onCommandProcessed();
        };
        handleCommand();
    }, [lastCommand, onCommandProcessed, handleSaveChanges]);

    return (
        <div className="h-full w-full overflow-y-auto p-4 sm:p-8">
            <div className="max-w-3xl mx-auto space-y-8">
                <h1 className="text-4xl font-bold text-slate-100">Settings</h1>
                
                <SettingsSection title="Profile Information">
                    <div>
                        <label htmlFor="name" className="block mb-2 text-sm font-medium text-slate-300">Name</label>
                        <input type="text" id="name" value={name} onChange={e => setName(e.target.value)} className="bg-slate-700 border border-slate-600 text-slate-100 text-base rounded-lg focus:ring-fuchsia-500 focus:border-fuchsia-500 block w-full p-2.5 transition" />
                    </div>
                    <div>
                        <label htmlFor="bio" className="block mb-2 text-sm font-medium text-slate-300">Bio</label>
                        <textarea id="bio" value={bio} onChange={e => setBio(e.target.value)} rows={3} className="bg-slate-700 border border-slate-600 text-slate-100 text-base rounded-lg focus:ring-fuchsia-500 focus:border-fuchsia-500 block w-full p-2.5 transition resize-none"></textarea>
                    </div>
                </SettingsSection>

                <SettingsSection title="Privacy Settings">
                    <div className="flex justify-between items-center">
                        <label htmlFor="postVisibility" className="font-medium text-slate-300">Default Post Visibility</label>
                        <select id="postVisibility" value={privacySettings.postVisibility} onChange={e => setPrivacySettings(p => ({...p, postVisibility: e.target.value as any}))} className="bg-slate-700 border border-slate-600 rounded-lg p-2">
                            <option value="public">Public</option>
                            <option value="friends">Friends</option>
                        </select>
                    </div>
                    <div className="flex justify-between items-center">
                        <label htmlFor="friendRequestPrivacy" className="font-medium text-slate-300">Who can send you friend requests?</label>
                        <select id="friendRequestPrivacy" value={privacySettings.friendRequestPrivacy} onChange={e => setPrivacySettings(p => ({...p, friendRequestPrivacy: e.target.value as any}))} className="bg-slate-700 border border-slate-600 rounded-lg p-2">
                            <option value="everyone">Everyone</option>
                            <option value="friends_of_friends">Friends of Friends</option>
                        </select>
                    </div>
                </SettingsSection>
                
                 <SettingsSection title="Notification Settings">
                    <div className="flex justify-between items-center">
                        <label className="font-medium text-slate-300">Likes on your posts</label>
                        <ToggleSwitch enabled={notificationSettings.likes ?? true} onChange={val => setNotificationSettings(s => ({...s, likes: val}))} />
                    </div>
                     <div className="flex justify-between items-center">
                        <label className="font-medium text-slate-300">Comments on your posts</label>
                        <ToggleSwitch enabled={notificationSettings.comments ?? true} onChange={val => setNotificationSettings(s => ({...s, comments: val}))} />
                    </div>
                    <div className="flex justify-between items-center">
                        <label className="font-medium text-slate-300">New friend requests</label>
                        <ToggleSwitch enabled={notificationSettings.friendRequests ?? true} onChange={val => setNotificationSettings(s => ({...s, friendRequests: val}))} />
                    </div>
                </SettingsSection>

                <SettingsSection title="Blocked Users" description="Unblock users you've previously blocked.">
                    {blockedUsers.length > 0 ? (
                        blockedUsers.map(user => (
                            <div key={user.id} className="flex justify-between items-center bg-slate-700/50 p-3 rounded-lg">
                                <p className="font-semibold text-slate-200">{user.name}</p>
                                <button onClick={() => onUnblockUser(user)} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm py-1.5 px-3 rounded-md">Unblock</button>
                            </div>
                        ))
                    ) : <p className="text-slate-400">You haven't blocked any users.</p>}
                </SettingsSection>

                <div className="flex justify-end gap-4">
                     <button onClick={handleSaveChanges} className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold py-3 px-6 rounded-lg transition-colors text-lg">
                        Save Changes
                    </button>
                </div>

                <div className="border-t border-red-500/30 pt-6 mt-12">
                    <h3 className="text-xl font-bold text-red-400">Danger Zone</h3>
                     <button onClick={onDeactivateAccount} className="mt-4 w-full text-left bg-red-900/50 border border-red-500/50 p-4 rounded-lg text-red-300 hover:bg-red-900 transition-colors">
                        <p className="font-bold">Deactivate Account</p>
                        <p className="text-sm">Your profile will be hidden and you will be logged out. You can reactivate by logging back in.</p>
                    </button>
                </div>
            </div>
        </div>
    );
};