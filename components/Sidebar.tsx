import React from 'react';
import { User, AppView, VoiceState } from '../types';
import Icon from './Icon';
import VoiceCommandInput from './VoiceCommandInput';

interface SidebarProps {
  currentUser: User;
  onNavigate: (viewName: 'feed' | 'explore' | 'reels' | 'friends' | 'settings' | 'profile' | 'messages' | 'ads_center' | 'rooms' | 'groups' | 'help') => void;
  friendRequestCount: number;
  activeView: AppView;
  voiceCoins: number;
  voiceState: VoiceState;
  onMicClick: () => void;
  isChatRecording: boolean;
  onSendCommand: (command: string) => void;
  commandInputValue: string;
  setCommandInputValue: (value: string) => void;
  ttsMessage: string;
}

const NavItem: React.FC<{
    iconName: React.ComponentProps<typeof Icon>['name'];
    label: string;
    isActive: boolean;
    badgeCount?: number;
    onClick: () => void;
}> = ({ iconName, label, isActive, badgeCount = 0, onClick }) => {
    return (
        <li>
            <button
                onClick={onClick}
                className={`w-full flex items-center gap-4 p-3 rounded-lg text-lg transition-colors ${
                    isActive
                        ? 'bg-fuchsia-500/10 text-fuchsia-300 font-bold'
                        : 'text-fuchsia-400/80 hover:bg-slate-800 hover:text-fuchsia-300'
                }`}
            >
                <Icon name={iconName} className="w-7 h-7" />
                <span>{label}</span>
                {badgeCount > 0 && (
                    <span className="ml-auto bg-fuchsia-500 text-black text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
                        {badgeCount}
                    </span>
                )}
            </button>
        </li>
    );
};

const Sidebar: React.FC<SidebarProps> = (props) => {
  const { currentUser, onNavigate, friendRequestCount, activeView, voiceCoins } = props;

  return (
    <aside className="w-72 bg-black/20 backdrop-blur-md flex-shrink-0 hidden md:flex flex-col p-4">
      <div className="flex-grow">
        {/* Profile Section */}
        <button
            onClick={() => onNavigate('profile')}
            className="w-full flex items-center gap-4 p-3 rounded-lg text-left hover:bg-slate-800 mb-6 transition-colors"
        >
          <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-12 h-12 rounded-full" />
          <div>
            <p className="font-bold text-fuchsia-200 text-lg">{currentUser.name}</p>
            <p className="text-sm text-fuchsia-500">View Profile</p>
          </div>
        </button>

        {/* Navigation */}
        <nav>
          <ul className="space-y-2">
            <NavItem
                iconName="home"
                label="Home"
                isActive={activeView === AppView.FEED}
                onClick={() => onNavigate('feed')}
            />
            <NavItem
                iconName="compass"
                label="Explore"
                isActive={activeView === AppView.EXPLORE}
                onClick={() => onNavigate('explore')}
            />
            <NavItem
                iconName="film"
                label="Reels"
                isActive={activeView === AppView.REELS}
                onClick={() => onNavigate('reels')}
            />
            <NavItem
                iconName="users"
                label="Friends"
                isActive={activeView === AppView.FRIENDS}
                badgeCount={friendRequestCount}
                onClick={() => onNavigate('friends')}
            />
             <NavItem
                iconName="users-group-solid"
                label="Groups"
                isActive={activeView === AppView.GROUPS_HUB || activeView === AppView.GROUP_PAGE}
                onClick={() => onNavigate('groups')}
            />
            <NavItem
                iconName="message"
                label="Messages"
                isActive={activeView === AppView.CONVERSATIONS}
                onClick={() => onNavigate('messages')}
            />
            <NavItem
                iconName="chat-bubble-group"
                label="Rooms"
                isActive={activeView === AppView.ROOMS_LIST || activeView === AppView.LIVE_ROOM || activeView === AppView.ROOMS_HUB}
                onClick={() => onNavigate('rooms')}
            />
             <NavItem
                iconName="briefcase"
                label="Ads Center"
                isActive={activeView === AppView.ADS_CENTER}
                onClick={() => onNavigate('ads_center')}
            />
            <NavItem
                iconName="settings"
                label="Settings"
                isActive={activeView === AppView.SETTINGS}
                onClick={() => onNavigate('settings')}
            />
            <NavItem
                iconName="question-mark-circle"
                label="Help & Commands"
                isActive={activeView === AppView.HELP}
                onClick={() => onNavigate('help')}
            />
          </ul>
        </nav>
      </div>

      {/* Voice Coins */}
      <div className="mb-4 bg-slate-900/50 shadow-md rounded-lg flex items-center justify-between p-3 border border-fuchsia-500/20">
          <div className="flex items-center gap-3">
              <Icon name="coin" className="w-8 h-8 text-yellow-400" />
              <div>
                  <p className="font-semibold text-fuchsia-300">Voice Coins</p>
                  <p className="text-xs text-fuchsia-500">For AI features</p>
              </div>
          </div>
          <p className="text-2xl font-bold text-yellow-400">{voiceCoins}</p>
      </div>


      {/* Voice Command Input */}
      <div className="flex-shrink-0">
        <VoiceCommandInput
            onSendCommand={props.onSendCommand}
            voiceState={props.voiceState}
            onMicClick={props.onMicClick}
            value={props.commandInputValue}
            onValueChange={props.setCommandInputValue}
            placeholder={props.ttsMessage}
            isChatRecording={props.isChatRecording}
        />
      </div>
    </aside>
  );
};

export default Sidebar;