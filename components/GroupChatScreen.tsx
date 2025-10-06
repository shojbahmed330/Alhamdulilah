import React, { useState, useEffect, useRef } from 'react';
import { GroupChat, Group, User, GroupChatMessage, ReplyInfo, Author } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import TaggedContent from './TaggedContent';
import Waveform from './Waveform';

const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

interface GroupChatScreenProps {
  currentUser: User;
  groupId: string;
  onGoBack: () => void;
  onOpenProfile: (userName: string) => void;
}

const MessageBubble: React.FC<{
    message: GroupChatMessage;
    isMe: boolean;
    onReply: (message: GroupChatMessage) => void;
    onReact: (messageId: string, emoji: string) => void;
    onOpenProfile: (username: string) => void;
}> = ({ message, isMe, onReply, onReact, onOpenProfile }) => {
    const [isMenuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const renderContent = () => {
        if (message.isDeleted) return <p className="italic text-sm text-slate-500">Message deleted</p>;
        if (message.mediaType === 'image' && message.mediaUrl) return <img src={message.mediaUrl} alt="Sent" className="max-w-xs max-h-48 rounded-lg cursor-pointer" />;
        if (message.audioUrl) return <audio src={message.audioUrl} controls className="w-48 h-10" />;
        return <p className="text-slate-200"><TaggedContent text={message.text || ''} onTagClick={onOpenProfile} /></p>;
    };
    
    const reactionSummary = Object.entries(message.reactions || {})
        .filter(([, userIds]) => (userIds as string[]).length > 0)
        .map(([emoji, userIds]) => ({ emoji, count: (userIds as string[]).length }))
        .sort((a, b) => b.count - a.count);

    return (
        <div className={`flex items-start gap-3 group relative ${isMe ? 'flex-row-reverse' : ''}`}>
            {!isMe && <img src={message.sender.avatarUrl} alt={message.sender.name} className="w-10 h-10 rounded-full cursor-pointer" onClick={() => onOpenProfile(message.sender.username)} />}
            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <p className="text-xs text-lime-400 font-semibold ml-2 mb-0.5">{message.sender.name}</p>}
                {message.replyTo && (
                    <div className="text-xs px-3 py-1 bg-slate-700/50 rounded-t-lg border-b border-lime-500/30">
                        <p className="font-bold">Replying to {message.replyTo.senderName}</p>
                        <p className="italic text-slate-400 truncate max-w-xs">"{message.replyTo.content}"</p>
                    </div>
                )}
                <div className="relative">
                    <div className={`px-3 py-2 rounded-2xl ${isMe ? 'bg-lime-800 rounded-br-none' : 'bg-slate-700 rounded-bl-none'}`}>
                        {renderContent()}
                    </div>
                    {reactionSummary.length > 0 && (
                        <div className="absolute -bottom-2.5 right-1 bg-slate-800 rounded-full px-1.5 text-xs flex items-center gap-1 border border-slate-900">
                            {reactionSummary.slice(0, 3).map(({ emoji }) => <span key={emoji}>{emoji}</span>)}
                        </div>
                    )}
                    <div ref={menuRef} className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'}`}>
                         <div className="flex bg-slate-800 rounded-full p-0.5 border border-slate-600">
                            <button onClick={() => setMenuOpen(p => !p)} className="p-1.5 rounded-full hover:bg-slate-700"><Icon name="face-smile" className="w-5 h-5 text-slate-300"/></button>
                            <button onClick={() => onReply(message)} className="p-1.5 rounded-full hover:bg-slate-700"><Icon name="reply" className="w-5 h-5 text-slate-300"/></button>
                        </div>
                        {isMenuOpen && (
                            <div className="absolute bottom-full mb-1 bg-slate-800 rounded-full p-1 flex items-center gap-1 shadow-lg border border-slate-600 z-10">
                                {EMOJI_REACTIONS.map(emoji => (
                                    <button key={emoji} onClick={() => { onReact(message.id, emoji); setMenuOpen(false); }} className="text-2xl p-1 rounded-full hover:bg-slate-700 transition-transform hover:scale-125">{emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
// FIX: Changed to a named export to resolve module import error in UserApp.tsx.
export const GroupChatScreen: React.FC<GroupChatScreenProps> = ({
  currentUser,
  groupId,
  onGoBack,
  onOpenProfile,
}) => {
  const [group, setGroup] = useState<Group | null>(null);
  const [chat, setChat] = useState<GroupChat | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<GroupChatMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubGroup = geminiService.listenToGroup(groupId, setGroup);
    const unsubChat = geminiService.listenToGroupChat(groupId, (chatData) => {
        setChat(chatData);
        setIsLoading(false);
    });
    return () => { unsubGroup(); unsubChat(); };
  }, [groupId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !group) return;
    
    await geminiService.sendGroupChatMessage(groupId, currentUser as Author, newMessage);
    
    setNewMessage('');
    setReplyingTo(null);
  };
  
  const handleReact = (messageId: string, emoji: string) => {
    geminiService.reactToGroupChatMessage(groupId, messageId, currentUser.id, emoji);
  };

  if (isLoading || !group) {
    return <div className="h-full flex items-center justify-center bg-slate-900"><p className="text-slate-300">Loading chat...</p></div>;
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <header className="flex-shrink-0 flex items-center p-3 border-b border-slate-700 bg-slate-800">
        <button onClick={onGoBack} className="p-2 rounded-full hover:bg-slate-700 transition-colors mr-2">
            <Icon name="back" className="w-6 h-6 text-slate-300"/>
        </button>
        <div>
          <h2 className="font-bold text-lg text-slate-100">{group.name}</h2>
          <p className="text-xs text-slate-400">{group.memberCount} members</p>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto p-4 space-y-4">
        {chat?.messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMe={msg.sender.id === currentUser.id}
            onReply={() => {}}
            onReact={handleReact}
            onOpenProfile={onOpenProfile}
          />
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-2 border-t border-slate-700 bg-slate-800">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Send a message..."
            className="flex-grow bg-slate-700 border border-slate-600 rounded-full py-2 px-4 text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
          />
          <button type="submit" className="p-2.5 bg-lime-600 rounded-full text-black hover:bg-lime-500 disabled:bg-slate-500" disabled={!newMessage.trim()}>
            <Icon name="paper-airplane" className="w-5 h-5"/>
          </button>
        </form>
      </footer>
    </div>
  );
};
