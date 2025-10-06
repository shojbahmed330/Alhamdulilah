import React, { useState, useRef, useEffect } from 'react';
import { AppView, VoiceState } from '../types';
import Icon from './Icon';
import VoiceCommandInput from './VoiceCommandInput';

interface MobileBottomNavProps {
    onNavigate: (viewName: 'feed' | 'explore' | 'reels' | 'friends' | 'profile' | 'messages' | 'rooms' | 'groups' | 'menu') => void;
    friendRequestCount: number;
    activeView: AppView;
    voiceState: VoiceState;
    onMicClick: () => void;
    onSendCommand: (command: string) => void;
    commandInputValue: string;
    setCommandInputValue: (value: string) => void;
    ttsMessage: string;
    isChatRecording: boolean;
}

const NavItem: React.FC<{
    iconName: React.ComponentProps<typeof Icon>['name'];
    label: string;
    isActive: boolean;
    badgeCount?: number;
    onClick: () => void;
}> = ({ iconName, label, isActive, badgeCount = 0, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-300 relative ${
                isActive ? 'text-fuchsia-400' : 'text-slate-400 hover:text-fuchsia-300'
            }`}
        >
            <div className="relative">
                <Icon name={iconName} className="w-7 h-7" />
                {badgeCount > 0 && (
                    <span className="absolute -top-1 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white border border-slate-900">{badgeCount}</span>
                )}
            </div>
            <span className={`text-xs transition-all duration-300 ${isActive ? 'opacity-100 font-semibold' : 'opacity-0'}`}>{label}</span>
             <div className={`absolute top-0 w-8 h-1 bg-fuchsia-400 rounded-full transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-0 -translate-y-2'}`}></div>
        </button>
    );
};


const MobileBottomNav: React.FC<MobileBottomNavProps> = (props) => {
    const { onNavigate, friendRequestCount, activeView } = props;
    
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden flex flex-col">
            {/* Command Input */}
            <VoiceCommandInput
                onSendCommand={props.onSendCommand}
                voiceState={props.voiceState}
                onMicClick={props.onMicClick}
                value={props.commandInputValue}
                onValueChange={props.setCommandInputValue}
                placeholder={props.ttsMessage}
                isChatRecording={props.isChatRecording}
            />

            {/* Main Navigation Bar */}
            <div className="h-16 bg-black/50 backdrop-blur-md border-t border-white/10 flex justify-around items-center">
                <NavItem
                    iconName="home-solid"
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
                    iconName="message"
                    label="Messages"
                    isActive={activeView === AppView.CONVERSATIONS}
                    onClick={() => onNavigate('messages')}
                />
                <NavItem
                    iconName="ellipsis-vertical"
                    label="Menu"
                    isActive={activeView === AppView.MOBILE_MENU}
                    onClick={() => onNavigate('menu')}
                />
            </div>
        </div>
    );
};

export default MobileBottomNav;