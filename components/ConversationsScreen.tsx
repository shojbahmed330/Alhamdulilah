import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User, Conversation, AppView, Message } from '../types';
import Icon from './Icon';
import { useSettings } from '../contexts/SettingsContext';
import { firebaseService } from '../services/firebaseService';
import { geminiService } from '../services/geminiService';
import {
    doc, onSnapshot
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';


const SWIPE_THRESHOLD = -80;
const SWIPE_ACTION_WIDTH = 80;

const docToUser = (doc: any): User => {
    const data = doc.data();
    const user = {
        id: doc.id,
        ...data,
    } as User;
    
    if (user.createdAt && typeof (user.createdAt as any).toDate === 'function') {
        user.createdAt = (user.createdAt as any).toDate().toISOString();
    }
    if (user.commentingSuspendedUntil && typeof (user.commentingSuspendedUntil as any).toDate === 'function') {
        user.commentingSuspendedUntil = (user.commentingSuspendedUntil as any).toDate().toISOString();
    }
     if (user.lastActiveTimestamp && typeof (user.lastActiveTimestamp as any).toDate === 'function') {
        user.lastActiveTimestamp = (user.lastActiveTimestamp as any).toDate().toISOString();
    }
    
    return user;
};

const formatLastActive = (isoString?: string): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 60) return 'now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'yesterday';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
};

const ConversationItem: React.FC<{
  conversation: Conversation;
  currentUserId: string;
  isPinned: boolean;
  isArchived: boolean;
  isNew: boolean;
  isTyping: boolean;
  style: React.CSSProperties;
  onClick: () => void;
  onPinToggle: (peerId: string) => void;
  onArchiveToggle: (peerId: string) => void;
  onDelete: (peerId: string) => void;
}> = ({ conversation, currentUserId, isPinned, isArchived, isNew, isTyping, style, onClick, onPinToggle, onArchiveToggle, onDelete }) => {
    const { peer, lastMessage, unreadCount } = conversation;
    
    const [swipeX, setSwipeX] = useState(0);
    
    const touchStart = useRef({ x: 0, y: 0, time: 0 });
    const isDragging = useRef(false);
    const isSwipingHorizontally = useRef(false);
    const dragStartSwipeX = useRef(0);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        isDragging.current = true;
        isSwipingHorizontally.current = false;
        touchStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
        dragStartSwipeX.current = swipeX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;
        const deltaX = e.clientX - touchStart.current.x;
        const deltaY = e.clientY - touchStart.current.y;
        
        if (!isSwipingHorizontally.current && Math.abs(deltaX) > Math.abs(deltaY) + 5) {
            isSwipingHorizontally.current = true;
        }

        if (isSwipingHorizontally.current) {
             const newSwipeX = dragStartSwipeX.current + deltaX;
             const clampedSwipeX = Math.max(-SWIPE_ACTION_WIDTH * 3 - 20, Math.min(newSwipeX, 20));
             setSwipeX(clampedSwipeX);
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;

        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        isDragging.current = false;

        if (swipeX < SWIPE_THRESHOLD * 2) {
             setSwipeX(-SWIPE_ACTION_WIDTH * 3);
        } else if (swipeX < SWIPE_THRESHOLD) {
             setSwipeX(-SWIPE_ACTION_WIDTH);
        } else {
            setSwipeX(0);
        }
        
        const pressDuration = Date.now() - touchStart.current.time;
        const movedDistance = Math.hypot(e.clientX - touchStart.current.x, e.clientY - touchStart.current.y);

        if (pressDuration < 250 && movedDistance < 10) {
            onClick();
        }
    };
    
    const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isDragging.current) handlePointerUp(e);
    };

    const handleActionClick = (action: 'pin' | 'archive' | 'delete', e: React.MouseEvent) => {
        e.stopPropagation();
        if (action === 'pin') onPinToggle(peer.id);
        else if (action === 'archive') onArchiveToggle(peer.id);
        else if (action === 'delete') onDelete(peer.id);
        setSwipeX(0);
    };

    if (!lastMessage) return null;

    const isUnread = unreadCount > 0;
    const isLastMessageFromMe = lastMessage.senderId === currentUserId;
    
    const timeDisplay = peer.onlineStatus === 'online'
        ? new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})
        : formatLastActive(peer.lastActiveTimestamp);

    const getSnippet = (message: Message): string => {
        if (message.isDeleted) return isLastMessageFromMe ? "You unsent a message" : "Unsent a message";
        const prefix = isLastMessageFromMe ? 'You: ' : '';
        switch (message.type) {
            case 'text': return prefix + (message.text || '');
            case 'image': return isLastMessageFromMe ? 'You sent an image 📷' : 'Sent an image 📷';
            case 'video': return isLastMessageFromMe ? 'You sent a video 📹' : 'Sent a video 📹';
            case 'audio': return `${prefix}Voice message · ${message.duration}s`;
            case 'call_history': 
                const callVerb = message.callStatus === 'missed' ? 'Missed' : 'Declined';
                return `${callVerb} ${message.callType} call`;
            default: return '...';
        }
    };

    return (
        <div className="w-full relative animate-list-item-slide-in" style={style}>
            <div className="absolute inset-y-0 right-0 flex items-center bg-slate-700 text-white z-0 overflow-hidden rounded-r-lg" style={{ width: `${-swipeX > 0 ? Math.min(-swipeX, SWIPE_ACTION_WIDTH * 3) : 0}px` }}>
                <button onClick={(e) => handleActionClick('pin', e)} className="w-20 h-full flex flex-col items-center justify-center gap-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50" disabled={isArchived}><Icon name="pin" className="w-6 h-6"/>{isPinned ? 'Unpin' : 'Pin'}</button>
                <button onClick={(e) => handleActionClick('archive', e)} className="w-20 h-full flex flex-col items-center justify-center gap-1 bg-slate-600 hover:bg-slate-500"><Icon name="archive-box" className="w-6 h-6"/>{isArchived ? 'Unarchive' : 'Archive'}</button>
                <button onClick={(e) => handleActionClick('delete', e)} className="w-20 h-full flex flex-col items-center justify-center gap-1 bg-red-600 hover:bg-red-500 transition-all rounded-r-lg"><Icon name="trash" className="w-6 h-6"/>Delete</button>
            </div>

            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                className={`w-full p-3 rounded-lg flex items-center gap-4 relative z-10 transition-transform duration-200 ease-out touch-pan-y ${isPinned ? 'bg-gradient-to-r from-fuchsia-900/40 via-slate-800/50 to-slate-800/50' : isUnread ? 'bg-slate-700/60' : 'bg-slate-800/50'} ${isNew ? 'animate-glow' : ''}`}
                style={{ transform: `translateX(${swipeX}px)` }}
            >
                <div className="relative flex-shrink-0">
                    <img src={peer.avatarUrl} alt={peer.name} className="w-16 h-16 rounded-full"/>
                    <div className={`absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-2 ${
                        peer.onlineStatus === 'online' ? 'bg-green-500 border-slate-900' : 'bg-slate-500 border-slate-800'
                    }`} />
                </div>
                <div className="flex-grow overflow-hidden">
                    <div className="flex justify-between items-baseline">
                        <p className={`text-lg truncate ${isUnread ? 'text-white font-bold' : 'text-slate-300 font-semibold'}`}>{peer.name}</p>
                        <p className={`text-xs flex-shrink-0 ${isUnread ? 'text-fuchsia-400 font-semibold' : 'text-slate-400'}`}>{timeDisplay}</p>
                    </div>
                    <div className="flex justify-between items-start mt-1">
                        {isTyping ? (
                            <p className="text-sm truncate pr-2 text-fuchsia-400 italic animate-pulse">typing...</p>
                        ) : (
                            <p className={`text-sm truncate pr-2 ${isUnread ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>{getSnippet(lastMessage)}</p>
                        )}
                        {isUnread && <span className="bg-fuchsia-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center flex-shrink-0">{unreadCount}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const NewChatItem: React.FC<{ user: User; onClick: () => void; }> = ({ user, onClick }) => (
    <button onClick={onClick} className="w-full p-3 rounded-lg flex items-center gap-4 hover:bg-slate-700/50 transition-colors animate-list-item-slide-in">
        <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full" />
        <div className="text-left">
            <p className="text-lg text-slate-300 font-semibold">{user.name}</p>
            <p className="text-sm text-sky-400">Tap to start a conversation</p>
        </div>
    </button>
);

const UndoSnackbar: React.FC<{ onUndo: () => void; text: string }> = ({ onUndo, text }) => (
    <div className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 w-11/12 max-w-md bg-slate-900/80 backdrop-blur-sm text-white p-3 rounded-lg shadow-2xl flex items-center justify-between z-20 animate-slide-in-bottom">
        <span>{text}</span>
        <button onClick={onUndo} className="font-bold text-sky-400 hover:text-sky-300 px-3 py-1 rounded-md">Undo</button>
    </div>
);


const ConversationsScreen: React.FC<{
  currentUser: User;
  onOpenConversation: (peer: User) => void;
  friends: User[];
}> = ({ currentUser, onOpenConversation, friends }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set(currentUser.pinnedChatIds || []));
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set(currentUser.archivedChatIds || []));
  const [undoAction, setUndoAction] = useState<{ type: 'delete' | 'archive'; peerId: string } | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  const [liveUsers, setLiveUsers] = useState<Map<string, User>>(new Map());
  const allRelevantUserIds = useMemo(() => {
    const peerIds = conversations.map(c => c.peer.id);
    return [...new Set([...peerIds, ...friends.map(f => f.id)])];
  }, [conversations, friends]);

  useEffect(() => {
      setPinnedIds(new Set(currentUser.pinnedChatIds || []));
      setArchivedIds(new Set(currentUser.archivedChatIds || []));
  }, [currentUser.pinnedChatIds, currentUser.archivedChatIds]);

  useEffect(() => {
      return () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); };
  }, []);

  useEffect(() => {
    if (allRelevantUserIds.length === 0) return;
    const unsubscribes = allRelevantUserIds.map(userId => onSnapshot(doc(db, 'users', userId), (doc) => {
        if (doc.exists()) setLiveUsers(prev => new Map(prev).set(userId, docToUser(doc)));
    }));
    return () => unsubscribes.forEach(unsub => unsub());
  }, [JSON.stringify(allRelevantUserIds)]);

  const onlineFriends = useMemo(() => friends.filter(friend => liveUsers.get(friend.id)?.onlineStatus === 'online'), [liveUsers, friends]);

  useEffect(() => {
    const unsubscribe = firebaseService.listenToConversations(currentUser.id, setConversations);
    return () => unsubscribe();
  }, [currentUser.id]);

  const updateProfileLists = async (updates: Partial<Pick<User, 'pinnedChatIds' | 'archivedChatIds'>>) => {
      await geminiService.updateProfile(currentUser.id, updates);
  };

  const handlePinToggle = async (peerId: string) => {
      const newPinnedIds = new Set(pinnedIds);
      if (newPinnedIds.has(peerId)) newPinnedIds.delete(peerId);
      else newPinnedIds.add(peerId);
      setPinnedIds(newPinnedIds);
      // FIX: Cast Array.from(Set) to string[] to resolve TypeScript error.
      await updateProfileLists({ pinnedChatIds: Array.from(newPinnedIds) });
  };

  const handleArchiveToggle = async (peerId: string, withUndo: boolean = false) => {
      if (withUndo) {
          setUndoAction({ type: 'archive', peerId });
          if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
          undoTimeoutRef.current = window.setTimeout(() => {
              performArchive(peerId);
              setUndoAction(null);
          }, 5000);
      } else {
          performArchive(peerId);
      }
  };
  
  const performArchive = (peerId: string) => {
      const newArchivedIds = new Set(archivedIds);
      let newPinnedIds = new Set(pinnedIds);

      if (newArchivedIds.has(peerId)) {
          newArchivedIds.delete(peerId);
      } else {
          newArchivedIds.add(peerId);
          if (pinnedIds.has(peerId)) {
              newPinnedIds.delete(peerId);
              setPinnedIds(newPinnedIds);
          }
      }
      setArchivedIds(newArchivedIds);
      // FIX: Cast Array.from(Set) to string[] to resolve TypeScript error.
      updateProfileLists({ archivedChatIds: Array.from(newArchivedIds), pinnedChatIds: Array.from(newPinnedIds) });
  };
  
  const handleDeleteChat = (peerId: string) => {
      setUndoAction({ type: 'delete', peerId });
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = window.setTimeout(() => {
          const chatId = firebaseService.getChatId(currentUser.id, peerId);
          firebaseService.deleteChatHistory(chatId);
          setUndoAction(null);
      }, 5000);
  };

  const handleUndo = () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      setUndoAction(null);
  };

  const enrichedConversations = useMemo(() => {
    return conversations.map(convo => {
        const liveUser = liveUsers.get(convo.peer.id);
        return liveUser ? { ...convo, peer: { ...convo.peer, ...liveUser } } : convo;
    });
  }, [conversations, liveUsers]);

  const { visibleConversations, newChatResults } = useMemo(() => {
    const baseList = enrichedConversations
        .filter(c => showArchived ? archivedIds.has(c.peer.id) : !archivedIds.has(c.peer.id))
        .sort((a, b) => {
            const aIsPinned = pinnedIds.has(a.peer.id);
            const bIsPinned = pinnedIds.has(b.peer.id);
            if (aIsPinned !== bIsPinned) return aIsPinned ? -1 : 1;
            const timeA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const timeB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return timeB - timeA;
        });

    if (!searchQuery.trim()) return { visibleConversations: baseList, newChatResults: [] };

    const lowerQuery = searchQuery.toLowerCase();
    const filteredConvos = baseList.filter(c =>
        c.peer.name.toLowerCase().includes(lowerQuery) ||
        (c.lastMessage?.text && c.lastMessage.text.toLowerCase().includes(lowerQuery))
    );

    const existingPeerIds = new Set(conversations.map(c => c.peer.id));
    const newChats = friends.filter(f =>
        !existingPeerIds.has(f.id) && f.name.toLowerCase().includes(lowerQuery)
    );
    
    return { visibleConversations: filteredConvos, newChatResults: newChats };
  }, [enrichedConversations, searchQuery, showArchived, archivedIds, pinnedIds, friends, conversations]);

  const getIsNew = (createdAt: string) => new Date().getTime() - new Date(createdAt).getTime() < 5000;

  return (
    <div className="h-full w-full flex flex-col">
      <header className="flex-shrink-0 p-4 border-b border-fuchsia-500/20 bg-black/30 backdrop-blur-sm z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-slate-100">Messages</h1>
          <button onClick={() => setShowArchived(s => !s)} className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300 hover:bg-fuchsia-500/10 px-3 py-1.5 rounded-md">
            <Icon name="archive-box" className="w-5 h-5"/>
            {showArchived ? 'Inbox' : 'Archived'}
          </button>
        </div>
        <form className="relative" onSubmit={(e) => e.preventDefault()}>
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <svg className="w-5 h-5 text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/></svg>
          </div>
          <input type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search messages or start a new chat..." className="bg-slate-800 border border-slate-700 text-slate-100 text-base rounded-full focus:ring-fuchsia-500 focus:border-fuchsia-500 block w-full pl-11 p-3 transition"/>
        </form>
      </header>
      
      {!searchQuery && onlineFriends.length > 0 && (
        <div className="px-4 pt-4 flex-shrink-0">
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {onlineFriends.map(friend => (
              <button key={friend.id} onClick={() => onOpenConversation(friend)} className="flex flex-col items-center gap-1 w-16 text-center flex-shrink-0">
                <div className="relative"><img src={friend.avatarUrl} alt={friend.name} className="w-14 h-14 rounded-full" /><div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900"></div></div>
                <p className="text-xs text-slate-300 truncate w-full">{friend.name.split(' ')[0]}</p>
              </button>
            ))}
          </div>
          <div className="border-t border-fuchsia-500/10 my-2"></div>
        </div>
      )}

      <div className="flex-grow overflow-y-auto p-4 space-y-3">
        {visibleConversations.length > 0 && visibleConversations.map((c, i) => (
            <ConversationItem key={c.peer.id} conversation={c} currentUserId={currentUser.id} isPinned={pinnedIds.has(c.peer.id)} isArchived={archivedIds.has(c.peer.id)} isNew={getIsNew(c.lastMessage?.createdAt)} isTyping={c.isTyping || false} style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }} onClick={() => onOpenConversation(c.peer)} onPinToggle={handlePinToggle} onArchiveToggle={() => handleArchiveToggle(c.peer.id, true)} onDelete={handleDeleteChat} />
        ))}
        {newChatResults.length > 0 && (
            <>
                <h2 className="text-sm font-bold uppercase text-fuchsia-400 pt-4">Start a new chat</h2>
                {newChatResults.map(friend => <NewChatItem key={friend.id} user={friend} onClick={() => onOpenConversation(friend)} />)}
            </>
        )}
        {visibleConversations.length === 0 && newChatResults.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center">
            <Icon name="message" className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-xl font-semibold">
              {searchQuery ? 'No results found' : showArchived ? 'No archived chats' : 'No conversations yet'}
            </p>
            <p>{searchQuery ? 'Try a different name or message text.' : 'Start a chat with a friend to see it here.'}</p>
          </div>
        )}
      </div>
       {undoAction && <UndoSnackbar onUndo={handleUndo} text={`Chat ${undoAction.type === 'delete' ? 'deleted' : 'archived'}.`} />}
    </div>
  );
};

export default ConversationsScreen;