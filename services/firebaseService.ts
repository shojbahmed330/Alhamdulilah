// @ts-nocheck
import {
    getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, onSnapshot,
    query, where, orderBy, limit, runTransaction, writeBatch, documentId,
    serverTimestamp, increment, arrayUnion, arrayRemove, deleteField, Timestamp, QuerySnapshot
} from 'firebase/firestore';
import {
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    type User as FirebaseUser
} from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';

import { db, auth, storage } from './firebaseConfig';
import { User, Post, Comment, Message, ReplyInfo, Story, Group, Campaign, LiveAudioRoom, LiveVideoRoom, Report, Notification, Lead, Author, AdminUser, FriendshipStatus, ChatSettings, Conversation, Call, LiveAudioRoomMessage, LiveVideoRoomMessage, VideoParticipantState, GroupChat } from '../types';
import { DEFAULT_AVATARS, DEFAULT_COVER_PHOTOS, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, SPONSOR_CPM_BDT } from '../constants';


// --- Helper Functions ---
const removeUndefined = (obj: any) => {
  if (!obj) return {};
  const newObj: { [key: string]: any } = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
};

const docToUser = (doc: DocumentSnapshot): User => {
    const data = doc.data();
    const user = {
        id: doc.id,
        ...data,
    } as User;
    
    // Convert Firestore Timestamps to ISO strings
    if (user.createdAt && user.createdAt instanceof Timestamp) {
        user.createdAt = user.createdAt.toDate().toISOString();
    }
    if (user.commentingSuspendedUntil && user.commentingSuspendedUntil instanceof Timestamp) {
        user.commentingSuspendedUntil = user.commentingSuspendedUntil.toDate().toISOString();
    }
     if (user.lastActiveTimestamp && user.lastActiveTimestamp instanceof Timestamp) {
        user.lastActiveTimestamp = user.lastActiveTimestamp.toDate().toISOString();
    }
    
    return user;
}

const docToPost = (doc: DocumentSnapshot): Post => {
    const data = doc.data() || {};
    return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        reactions: data.reactions || {},
        comments: (data.comments || []).map((c: any) => ({
            ...c,
            createdAt: c.createdAt instanceof Timestamp ? c.createdAt.toDate().toISOString() : new Date().toISOString(),
        })),
        commentCount: data.commentCount || 0,
    } as Post;
}

const getDailyCollectionId = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getUTCFullYear();
    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    return `${year}_${month}_${day}`;
};

const _createNotification = async (recipientId: string, type: Notification['type'], actor: User, options: Partial<Notification> = {}) => {
    if (recipientId === actor.id) {
        return; // Don't notify users of their own actions
    }

    try {
        const recipientDoc = await getDoc(doc(db, 'users', recipientId));
        if (!recipientDoc.exists()) return;
        const recipient = recipientDoc.data() as User;

        const settings = recipient.notificationSettings || {};
        const isEnabled = {
            like: settings.likes !== false,
            comment: settings.comments !== false,
            mention: true, // Always notify mentions
            friend_request: settings.friendRequests !== false,
            friend_request_approved: true, // Always on
            campaign_approved: settings.campaignUpdates !== false,
            campaign_rejected: settings.campaignUpdates !== false,
            admin_announcement: true, // Always on
            admin_warning: true, // Always on
            group_post: settings.groupPosts !== false,
            group_join_request: true, // Always on for admins/mods
            group_request_approved: true, // Always on for the user
        }[type] ?? true;
        
        if (!isEnabled) {
            return;
        }
        
        const dailyId = getDailyCollectionId(new Date());
        const notificationRef = collection(db, 'notifications', dailyId, 'items');
        
        const actorInfo: Author = {
            id: actor.id,
            name: actor.name,
            avatarUrl: actor.avatarUrl,
            username: actor.username,
        };

        // Explicitly construct the notification object to ensure data integrity
        const notificationData: Omit<Notification, 'id'> = {
            recipientId,
            type,
            user: actorInfo,
            read: false,
            createdAt: new Date().toISOString(),
            post: options.post,
            comment: options.comment,
            groupId: options.groupId,
            groupName: options.groupName,
            campaignName: options.campaignName,
            rejectionReason: options.rejectionReason,
            message: options.message,
        };

        await addDoc(notificationRef, removeUndefined(notificationData));
    } catch (error) {
        console.error(`Failed to create notification for user ${recipientId}:`, error);
    }
};

const _parseMentions = async (text: string): Promise<string[]> => {
    const mentionRegex = /@([\w_]+)/g;
    const mentions = text.match(mentionRegex);
    if (!mentions) return [];

    const usernames = mentions.map(m => m.substring(1).toLowerCase());
    const uniqueUsernames = [...new Set(usernames)];

    const userIds: string[] = [];
    for (const username of uniqueUsernames) {
        const userDocRef = doc(db, 'usernames', username);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            userIds.push(userDoc.data().userId);
        }
    }
    return userIds;
};


// --- New Cloudinary Upload Helper ---
const uploadMediaToCloudinary = async (file: File | Blob, fileName: string): Promise<{ url: string, type: 'image' | 'video' | 'raw' }> => {
    const formData = new FormData();
    formData.append('file', file, fileName);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    let resourceType = 'auto';
    if (file.type.startsWith('video')) resourceType = 'video';
    else if (file.type.startsWith('image')) resourceType = 'image';
    else if (file.type.startsWith('audio')) resourceType = 'video'; // Cloudinary treats audio as video for transformations/delivery
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Cloudinary upload error:', errorData);
        throw new Error('Failed to upload media to Cloudinary');
    }

    const data = await response.json();
    return { url: data.secure_url, type: data.resource_type };
};

// --- Ad Targeting Helper ---
const matchesTargeting = (campaign: Campaign, user: User): boolean => {
    if (!campaign.targeting) return true; // No targeting set, matches everyone
    const { location, gender, ageRange, interests } = campaign.targeting;

    // Location check
    if (location && user.currentCity && location.toLowerCase().trim() !== user.currentCity.toLowerCase().trim()) {
        return false;
    }

    // Gender check
    if (gender && gender !== 'All' && user.gender && gender !== user.gender) {
        return false;
    }

    // Age range check
    if (ageRange && user.age) {
        const [min, max] = ageRange.split('-').map(part => parseInt(part, 10));
        if (user.age < min || user.age > max) {
            return false;
        }
    }

    // Interests check (simple bio check)
    if (interests && interests.length > 0 && user.bio) {
        const userBioLower = user.bio.toLowerCase();
        const hasMatchingInterest = interests.some(interest => userBioLower.includes(interest.toLowerCase()));
        if (!hasMatchingInterest) {
            return false;
        }
    }

    return true;
};

// --- Service Definition ---
export const firebaseService = {
    // --- Authentication ---
    onAuthStateChanged: (callback: (userAuth: { id: string } | null) => void) => {
        return onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
                callback({ id: firebaseUser.uid });
            } else {
                callback(null);
            }
        });
    },

    listenToCurrentUser(userId: string, callback: (user: User | null) => void) {
        const userRef = doc(db, 'users', userId);
        return onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                callback(docToUser(doc));
            } else {
                callback(null);
            }
        });
    },

    async signUpWithEmail(email: string, pass: string, fullName: string, username: string): Promise<boolean> {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;
            if (user) {
                const userRef = doc(db, 'users', user.uid);
                const usernameRef = doc(db, 'usernames', username.toLowerCase());

                const newUserProfile: Omit<User, 'id' | 'createdAt'> = {
                    name: fullName,
                    name_lowercase: fullName.toLowerCase(),
                    username: username.toLowerCase(),
                    email: email.toLowerCase(),
                    avatarUrl: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
                    bio: `Welcome to VoiceBook, I'm ${fullName.split(' ')[0]}!`,
                    coverPhotoUrl: DEFAULT_COVER_PHOTOS[Math.floor(Math.random() * DEFAULT_COVER_PHOTOS.length)],
                    privacySettings: { postVisibility: 'public', friendRequestPrivacy: 'everyone', friendListVisibility: 'friends' },
                    notificationSettings: { likes: true, comments: true, friendRequests: true },
                    blockedUserIds: [],
                    voiceCoins: 100,
                    friendIds: [],
                    groupIds: [],
                    onlineStatus: 'offline',
                    // @ts-ignore
                    createdAt: serverTimestamp(),
                    // @ts-ignore
                    lastActiveTimestamp: serverTimestamp(),
                };
                
                await setDoc(userRef, removeUndefined(newUserProfile));
                await setDoc(usernameRef, { userId: user.uid });
                return true;
            }
            return false;
        } catch (error) {
            console.error("Sign up error:", error);
            return false;
        }
    },

    async signInWithEmail(identifier: string, pass: string): Promise<void> {
        const lowerIdentifier = identifier.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let emailToSignIn: string;

        if (emailRegex.test(lowerIdentifier)) {
            emailToSignIn = lowerIdentifier;
        } else {
            try {
                const usernameDocRef = doc(db, 'usernames', lowerIdentifier);
                const usernameDoc = await getDoc(usernameDocRef);
                if (!usernameDoc.exists()) throw new Error("Invalid details.");
                const userId = usernameDoc.data()!.userId;
                const userProfile = await firebaseService.getUserProfileById(userId);
                if (!userProfile) throw new Error("User profile not found.");
                emailToSignIn = userProfile.email;
            } catch (error: any) {
                throw new Error("Invalid details. Please check your username/email and password.");
            }
        }

        try {
            await signInWithEmailAndPassword(auth, emailToSignIn, pass);
        } catch (authError) {
            throw new Error("Invalid details. Please check your username/email and password.");
        }
    },
    
    async signOutUser(userId: string | null): Promise<void> {
        if (userId) {
            try {
                await firebaseService.updateUserOnlineStatus(userId, 'offline');
            } catch(e: any) {
                console.error("Could not set user offline before signing out, but proceeding with sign out.", e);
            }
        }
        await signOut(auth);
    },

    async updateUserOnlineStatus(userId: string, status: 'online' | 'offline'): Promise<void> {
        if (!userId) {
            console.warn("updateUserOnlineStatus called with no userId. Aborting.");
            return;
        }
        const userRef = doc(db, 'users', userId);
        try {
            const updateData: { onlineStatus: string; lastActiveTimestamp?: any } = { onlineStatus: status };
            if (status === 'offline') {
                updateData.lastActiveTimestamp = serverTimestamp();
            }
            await updateDoc(userRef, updateData);
        } catch (error: any) {
            // This can happen if the user logs out and rules prevent writes. It's okay to ignore.
            console.log(`Could not update online status for user ${userId}:`, error.message);
        }
    },

    // --- Notifications (Sharded Daily) ---
    listenToNotifications(userId: string, callback: (notifications: Notification[]) => void): () => void {
        const allUnsubscribes: (() => void)[] = [];
        const dailyNotifications = new Map<string, Notification[]>();

        const processAndCallback = () => {
            const combined = Array.from(dailyNotifications.values()).flat();
            combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            callback(combined.slice(0, 50));
        };

        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dailyId = getDailyCollectionId(date);

            const notificationsRef = collection(db, 'notifications', dailyId, 'items');
            const q = query(notificationsRef, where('recipientId', '==', userId));
            
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const notifications = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                    } as Notification;
                });
                
                dailyNotifications.set(dailyId, notifications);
                processAndCallback();
            }, (error) => {
                console.warn(`Could not listen to collection for date ${dailyId}. It may not exist yet.`, error.code);
                if (dailyNotifications.has(dailyId)) {
                    dailyNotifications.delete(dailyId);
                    processAndCallback();
                }
            });

            allUnsubscribes.push(unsubscribe);
        }

        return () => {
            allUnsubscribes.forEach(unsub => unsub());
        };
    },

    async markNotificationsAsRead(userId: string, notificationsToMark: Notification[]): Promise<void> {
        if (notificationsToMark.length === 0) return;

        const groupedByDay = new Map<string, string[]>();
        notificationsToMark.forEach(n => {
            const dailyId = getDailyCollectionId(n.createdAt);
            if (!groupedByDay.has(dailyId)) {
                groupedByDay.set(dailyId, []);
            }
            groupedByDay.get(dailyId)!.push(n.id);
        });

        const batch = writeBatch(db);

        groupedByDay.forEach((ids, dailyId) => {
            ids.forEach(id => {
                const docRef = doc(db, 'notifications', dailyId, 'items', id);
                batch.update(docRef, { read: true });
            });
        });

        await batch.commit();
    },

    async isUsernameTaken(username: string): Promise<boolean> {
        const usernameDocRef = doc(db, 'usernames', username.toLowerCase());
        const usernameDoc = await getDoc(usernameDocRef);
        return usernameDoc.exists();
    },
    
    async getUserProfileById(uid: string): Promise<User | null> {
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            return docToUser(userDoc);
        }
        return null;
    },

     async getUsersByIds(userIds: string[]): Promise<User[]> {
        if (userIds.length === 0) return [];
        const usersRef = collection(db, 'users');
        const userPromises: Promise<QuerySnapshot>[] = [];
        for (let i = 0; i < userIds.length; i += 10) {
            const chunk = userIds.slice(i, i + 10);
            const q = query(usersRef, where(documentId(), 'in', chunk));
            userPromises.push(getDocs(q));
        }
        const userSnapshots = await Promise.all(userPromises);
        const users: User[] = [];
        userSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => users.push(docToUser(doc)));
        });
        return users;
    },

    // --- Friends (New Secure Flow) ---
    async getFriendRequests(userId: string): Promise<User[]> {
        const friendRequestsRef = collection(db, 'friendRequests');
        const q = query(friendRequestsRef,
            where('to.id', '==', userId),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc'));
        
        const snapshot = await getDocs(q);
        const requesters = snapshot.docs.map(doc => doc.data().from as User);
        return requesters;
    },

    async addFriend(currentUserId: string, targetUserId: string): Promise<{ success: boolean; reason?: string }> {
        if (!currentUserId) {
            console.error("addFriend failed: No currentUserId provided.");
            return { success: false, reason: 'not_signed_in' };
        }
        
        const sender = await firebaseService.getUserProfileById(currentUserId);
        const receiver = await firebaseService.getUserProfileById(targetUserId);

        if (!sender || !receiver) return { success: false, reason: 'user_not_found' };
        
        try {
            const requestId = `${currentUserId}_${targetUserId}`;
            const requestDocRef = doc(db, 'friendRequests', requestId);

            await setDoc(requestDocRef, {
                from: { id: sender.id, name: sender.name, avatarUrl: sender.avatarUrl, username: sender.username },
                to: { id: receiver.id, name: receiver.name, avatarUrl: receiver.avatarUrl, username: receiver.username },
                status: 'pending',
                createdAt: serverTimestamp(),
            });

            await _createNotification(targetUserId, 'friend_request', sender);
            
            return { success: true };
        } catch (error) {
            console.error("FirebaseError on addFriend:", error);
            return { success: false, reason: 'permission_denied' };
        }
    },

    async acceptFriendRequest(currentUserId: string, requestingUserId: string): Promise<void> {
        const currentUserRef = doc(db, 'users', currentUserId);
        const requestingUserRef = doc(db, 'users', requestingUserId);
        const requestDocRef = doc(db, 'friendRequests', `${requestingUserId}_${currentUserId}`);
        
        await runTransaction(db, async (transaction) => {
            const requestDoc = await transaction.get(requestDocRef);
            if (!requestDoc.exists() || requestDoc.data()?.status !== 'pending') {
                throw new Error("Friend request not found or already handled.");
            }
            
            const currentUserDoc = await transaction.get(currentUserRef);
            if (!currentUserDoc.exists()) throw new Error("Current user profile not found.");
            
            const currentUserData = docToUser(currentUserDoc);

            transaction.update(currentUserRef, { friendIds: arrayUnion(requestingUserId) });
            transaction.update(requestingUserRef, { friendIds: arrayUnion(currentUserId) });
            transaction.delete(requestDocRef);
            
            // This is async, but we don't need to wait for it inside the transaction
            _createNotification(requestingUserId, 'friend_request_approved', currentUserData);
        });
    },

    async declineFriendRequest(currentUserId: string, requestingUserId: string): Promise<void> {
        const requestDocRef = doc(db, 'friendRequests', `${requestingUserId}_${currentUserId}`);
        await deleteDoc(requestDocRef);
    },

    async unfriendUser(currentUserId: string, targetUserId: string): Promise<boolean> {
        const currentUserRef = doc(db, 'users', currentUserId);
        const targetUserRef = doc(db, 'users', targetUserId);
        try {
            const batch = writeBatch(db);
            batch.update(currentUserRef, { friendIds: arrayRemove(targetUserId) });
            batch.update(targetUserRef, { friendIds: arrayRemove(currentUserId) });
            await batch.commit();
            return true;
        } catch (error) {
            console.error("Error unfriending user:", error);
            return false;
        }
    },

    async cancelFriendRequest(currentUserId: string, targetUserId: string): Promise<boolean> {
        const requestDocRef = doc(db, 'friendRequests', `${currentUserId}_${targetUserId}`);
        try {
            await deleteDoc(requestDocRef);
            return true;
        } catch (error) {
            console.error("Error cancelling friend request:", error);
            return false;
        }
    },
    
    async checkFriendshipStatus(currentUserId: string, profileUserId: string): Promise<FriendshipStatus> {
        const user = await firebaseService.getUserProfileById(currentUserId);
        if (user?.friendIds?.includes(profileUserId)) {
            return FriendshipStatus.FRIENDS;
        }
        
        try {
            const sentRequestRef = doc(db, 'friendRequests', `${currentUserId}_${profileUserId}`);
            const receivedRequestRef = doc(db, 'friendRequests', `${profileUserId}_${currentUserId}`);
    
            const [sentSnap, receivedSnap] = await Promise.all([getDoc(sentRequestRef), getDoc(receivedRequestRef)]);
    
            if (sentSnap.exists()) {
                const status = sentSnap.data()?.status;
                if (status === 'accepted') return FriendshipStatus.FRIENDS;
                return FriendshipStatus.REQUEST_SENT;
            }
    
            if (receivedSnap.exists()) {
                const status = receivedSnap.data()?.status;
                if (status === 'accepted') return FriendshipStatus.FRIENDS;
                return FriendshipStatus.PENDING_APPROVAL;
            }
    
        } catch (error) {
            console.error("Error checking friendship status, likely permissions. Falling back.", error);
            return FriendshipStatus.NOT_FRIENDS;
        }
    
        return FriendshipStatus.NOT_FRIENDS;
    },

    listenToFriendRequests(userId: string, callback: (requestingUsers: User[]) => void) {
        const friendRequestsRef = collection(db, 'friendRequests');
        const q = query(friendRequestsRef,
            where('to.id', '==', userId),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc'));
        
        return onSnapshot(q, snapshot => {
            const requesters = snapshot.docs.map(doc => doc.data().from as User);
            callback(requesters);
        });
    },

    async getFriends(userId: string): Promise<User[]> {
        const user = await firebaseService.getUserProfileById(userId);
        if (!user || !user.friendIds || user.friendIds.length === 0) {
            return [];
        }
        return firebaseService.getUsersByIds(user.friendIds);
    },

    async getCommonFriends(userId1: string, userId2: string): Promise<User[]> {
        if (userId1 === userId2) return [];
  
        const [user1Doc, user2Doc] = await Promise.all([
            firebaseService.getUserProfileById(userId1),
            firebaseService.getUserProfileById(userId2)
        ]);
  
        if (!user1Doc || !user2Doc || !user1Doc.friendIds || !user2Doc.friendIds) {
            return [];
        }
  
        const commonFriendIds = user1Doc.friendIds.filter(id => user2Doc.friendIds.includes(id));
  
        if (commonFriendIds.length === 0) {
            return [];
        }
  
        return firebaseService.getUsersByIds(commonFriendIds);
    },

    // --- Posts ---
    listenToFeedPosts(currentUserId: string, friendIds: string[], blockedUserIds: string[], callback: (posts: Post[]) => void): () => void {
        const postsRef = collection(db, 'posts');
        const postsMap = new Map<string, Post>();
        let allUnsubscribes: (() => void)[] = [];
    
        const processAndCallback = () => {
            const allPosts = Array.from(postsMap.values())
                .--- START OF FILE CreatePostScreen.tsx ---

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RecordingState, User, Post, PollOption } from './types';
import { IMAGE_GENERATION_COST, getTtsPrompt } from './constants';
import Waveform from './components/Waveform';
import Icon from './components/Icon';
import { geminiService } from './services/geminiService';
import { firebaseService } from './services/firebaseService';
import { useSettings } from './contexts/SettingsContext';

interface CreatePostScreenProps {
  user: User;
  onPostCreated: (newPost: Post | null) => void;
  onSetTtsMessage: (message: string) => void;
  lastCommand: string | null;
  onDeductCoinsForImage: () => Promise<boolean>;
  onCommandProcessed: () => void;
  onGoBack: () => void;
  groupId?: string;
  groupName?: string;
  startRecording?: boolean;
}

const CreatePostScreen: React.FC<CreatePostScreenProps> = ({ user, onPostCreated, onSetTtsMessage, lastCommand, onDeductCoinsForImage, onCommandProcessed, onGoBack, groupId, groupName, startRecording }) => {
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [duration, setDuration] = useState(0);
  const [caption, setCaption] = useState('');
  
  // New state for image generation
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // New state for polls
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  
  // New state for media uploads
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New state for real audio recording
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isPosting, setIsPosting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { language } = useSettings();

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);
  }, [stopTimer]);
  
  const clearOtherInputs = () => {
    setGeneratedImageUrl(null);
    setImagePrompt('');
    setShowPollCreator(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    setMediaFile(null);
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(null);
    setMediaType(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelectClick = (type: 'image' | 'video') => {
    if (fileInputRef.current) {
        fileInputRef.current.accept = `${type}/*`;
        fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        setMediaFile(file);
        setMediaType(file.type.startsWith('video') ? 'video' : 'image');
        if (mediaPreviewUrl) {
            URL.revokeObjectURL(mediaPreviewUrl);
        }
        setMediaPreviewUrl(URL.createObjectURL(file));
        clearOtherInputs();
    }
  };

  const clearMedia = () => {
    setMediaFile(null);
    if (mediaPreviewUrl) {
        URL.revokeObjectURL(mediaPreviewUrl);
    }
    setMediaPreviewUrl(null);
    setMediaType(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const handleStartRecording = useCallback(async () => {
    if (recordingState === RecordingState.RECORDING || mediaFile) return;
    clearMedia();
    clearOtherInputs();

    if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const newAudioUrl = URL.createObjectURL(audioBlob);
            setAudioUrl(newAudioUrl);
            stream.getTracks().forEach(track => track.stop());
            onSetTtsMessage(getTtsPrompt('record_stopped', language, { duration }));
        };
        
        recorder.start();
        setRecordingState(RecordingState.RECORDING);
        onSetTtsMessage(getTtsPrompt('record_start', language));
        startTimer();

    } catch (err: any) {
        console.error("Mic permission error:", err);
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            onSetTtsMessage(getTtsPrompt('error_mic_not_found', language));
        } else {
            onSetTtsMessage(getTtsPrompt('error_mic_permission', language));
        }
    }
  }, [recordingState, mediaFile, audioUrl, onSetTtsMessage, startTimer, duration, language]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        stopTimer();
        setRecordingState(RecordingState.PREVIEW);
    }
  }, [stopTimer]);

  useEffect(() => {
    if(startRecording) {
        handleStartRecording();
    } else {
        onSetTtsMessage(getTtsPrompt('create_post_prompt', language, { cost: IMAGE_GENERATION_COST }));
    }
    return () => {
        stopTimer();
        if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
    };
  }, [startRecording, onSetTtsMessage, stopTimer, handleStartRecording, mediaPreviewUrl, audioUrl, language]);
  
  const handleGenerateImage = useCallback(async () => {
    if (!imagePrompt.trim() || isGeneratingImage || mediaFile) return;

    if ((user.voiceCoins || 0) < IMAGE_GENERATION_COST) {
        onSetTtsMessage(getTtsPrompt('image_generation_insufficient_coins', language, { cost: IMAGE_GENERATION_COST, balance: user.voiceCoins || 0 }));
        return;
    }

    const paymentSuccess = await onDeductCoinsForImage();
    if (!paymentSuccess) {
        return;
    }
    
    clearMedia();
    clearOtherInputs();
    setIsGeneratingImage(true);
    onSetTtsMessage("Generating your masterpiece...");
    const imageUrl = await geminiService.generateImageForPost(imagePrompt);
    setIsGeneratingImage(false);
    
    if(imageUrl) {
        setGeneratedImageUrl(imageUrl);
        onSetTtsMessage(`Image generated! You can now add a caption or voice note.`);
    } else {
        onSetTtsMessage(`Sorry, I couldn't generate an image for that prompt. Please try another one.`);
    }
  }, [imagePrompt, isGeneratingImage, onSetTtsMessage, user.voiceCoins, onDeductCoinsForImage, mediaFile, language]);

  const handleClearImage = useCallback(() => {
    setGeneratedImageUrl(null);
    setImagePrompt('');
    onSetTtsMessage('Image cleared.');
  }, [onSetTtsMessage]);

  const handlePost = useCallback(async () => {
    const hasPoll = showPollCreator && pollQuestion.trim() && pollOptions.every(opt => opt.trim());
    const hasMedia = mediaFile && mediaPreviewUrl;
    const hasAudio = recordingState === RecordingState.PREVIEW && audioUrl;
    const hasContent = caption.trim() || hasAudio || generatedImageUrl || hasPoll || hasMedia;

    if (isPosting || !hasContent) {
        onSetTtsMessage("Please add some content before posting.");
        return;
    };
    
    setIsPosting(true);
    setRecordingState(RecordingState.UPLOADING);
    onSetTtsMessage("Publishing your post...");

    try {
        const postBaseData: any = {
            author: user,
            duration: hasAudio ? duration : 0,
            caption: caption,
            status: groupId ? 'pending' : 'approved',
            comments: [],
            likedBy: [],
        };
        
        if (generatedImageUrl) {
            postBaseData.imagePrompt = imagePrompt;
        }
        if (groupId) {
            postBaseData.groupId = groupId;
        }
        if (groupName) {
            postBaseData.groupName = groupName;
        }
        if (hasPoll) {
            postBaseData.poll = {
                question: pollQuestion,
                options: pollOptions.filter(opt => opt.trim()).map(opt => ({ text: opt, votes: 0, votedBy: [] }))
            };
        }
        
        // @FIX: 'mediaFile' does not exist. It should be 'mediaFiles' and expect an array.
        await firebaseService.createPost(
            postBaseData, 
            {
                mediaFiles: mediaFile ? [mediaFile] : [],
                audioBlobUrl: audioUrl,
                generatedImageBase64: generatedImageUrl
            }
        );

        if (postBaseData.status === 'pending') {
            onSetTtsMessage(getTtsPrompt('post_pending_approval', language));
            setTimeout(() => onGoBack(), 1500); 
        } else {
            onPostCreated(null);
        }
    } catch (error: any) {
        console.error("Failed to create post:", error);
        onSetTtsMessage(`Failed to create post: ${error.message}`);
        setIsPosting(false);
        setRecordingState(RecordingState.IDLE);
    }
  }, [isPosting, caption, duration, user, onSetTtsMessage, onPostCreated, onGoBack, generatedImageUrl, imagePrompt, groupId, groupName, showPollCreator, pollQuestion, pollOptions, mediaFile, mediaPreviewUrl, audioUrl, recordingState, language]);
  
  const handlePollOptionChange = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };
  
  const addPollOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      const newOptions = [...pollOptions];
      newOptions.splice(index, 1);
      setPollOptions(newOptions);
    }
  };

  useEffect(() => {
    if (!lastCommand) return;
    
    const processCommand = async () => {
        try {
            const intentResponse = await geminiService.processIntent(lastCommand);
            
            switch(intentResponse.intent) {
                case 'intent_go_back':
                    onGoBack();
                    break;
                case 'intent_create_post': 
                    handleStartRecording();
                    break;
                case 'intent_stop_recording':
                    if (recordingState === RecordingState.RECORDING) handleStopRecording();
                    break;
                case 'intent_re_record':
                     if (recordingState === RecordingState.PREVIEW) {
                         setDuration(0);
                         handleStartRecording();
                     }
                     break;
                case 'intent_post_confirm':
                    handlePost();
                    break;
                case 'intent_generate_image':
                    if (intentResponse.slots?.prompt) {
                        const promptText = intentResponse.slots.prompt as string;
                        setImagePrompt(promptText);
                        setTimeout(() => handleGenerateImage(), 100);
                    }
                    break;
                case 'intent_clear_image':
                    handleClearImage();
                    break;
                case 'intent_create_poll':
                    setShowPollCreator(true);
                    onSetTtsMessage("Poll creator opened. Please type the question and options.");
                    break;
            }
        } catch (error) {
            console.error("Error processing command in CreatePostScreen:", error);
        } finally {
            onCommandProcessed();
        }
    };
    
    processCommand();
  }, [lastCommand, recordingState, handleStartRecording, handleStopRecording, handlePost, handleGenerateImage, handleClearImage, onCommandProcessed, onGoBack, onSetTtsMessage]);

  const canAffordImage = (user.voiceCoins || 0) >= IMAGE_GENERATION_COST;

  const renderRecordingControls = () => {
      switch (recordingState) {
          case RecordingState.IDLE:
              return (
                  <button onClick={handleStartRecording} className="w-full flex items-center justify-center gap-3 bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-4 rounded-lg transition-colors">
                      <Icon name="mic" className="w-6 h-6" />
                      <span>Record Voice</span>
                  </button>
              );
          case RecordingState.RECORDING:
              return (
                  <div className="w-full flex flex-col items-center gap-4">
                      <div className="w-full h-24 bg-slate-700/50 rounded-lg overflow-hidden">
                          <Waveform isPlaying={true} isRecording={true} />
                      </div>
                       <div className="text-2xl font-mono text-slate-300">
                          00:{duration.toString().padStart(2, '0')}
                      </div>
                      <button onClick={handleStopRecording} className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white transition-colors">
                          <Icon name="pause" className="w-8 h-8" />
                          <span className="sr-only">Stop Recording</span>
                      </button>
                  </div>
              );
          case RecordingState.PREVIEW:
              return (
                 <div className="w-full flex flex-col items-center gap-4 p-4 bg-slate-700/50 rounded-lg">
                      <p className="font-semibold text-slate-200">Voice Recorded: {duration}s</p>
                      {audioUrl && <audio src={audioUrl} controls className="w-full" />}
                      <div className="flex gap-4">
                        <button onClick={handleStartRecording} className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors">Re-record</button>
                        <p className="text-slate-400 self-center">Ready to post?</p>
                      </div>
                  </div>
              )
          case RecordingState.UPLOADING:
          case RecordingState.POSTED:
             return <p className="text-lg text-rose-400">{isPosting ? 'Publishing your post...' : 'Posted successfully!'}</p>
      }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-slate-100 p-4 sm:p-8">
      <div className="w-full max-w-lg bg-slate-800 rounded-2xl p-6 flex flex-col gap-6">
        <h2 className="text-3xl font-bold">Create Post</h2>
        {groupName && (
            <div className="text-sm text-center bg-slate-700/50 p-2 rounded-md text-slate-300">
                Posting in <span className="font-bold text-rose-400">{groupName}</span>
            </div>
        )}
        
         <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

        <div className="flex items-start gap-4">
             <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full mt-2" />
             <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`}
                className="flex-grow bg-transparent text-slate-100 text-lg rounded-lg focus:ring-0 focus:outline-none min-h-[100px] resize-none"
                rows={3}
             />
        </div>

        {mediaPreviewUrl && (
            <div className="relative group/media">
                <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
                    {mediaType === 'image' ? (
                        <img src={mediaPreviewUrl} alt="Preview" className="max-h-full max-w-full object-contain rounded-lg" />
                    ) : (
                        <video src={mediaPreviewUrl} controls className="max-h-full max-w-full rounded-lg" />
                    )}
                </div>
                <button onClick={clearMedia} className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white opacity-50 group-hover/media:opacity-100 transition-opacity" aria-label="Clear media">
                    <Icon name="close" className="w-5 h-5"/>
                </button>
            </div>
        )}

        {showPollCreator && (
            <div className="border-t border-b border-slate-700 py-6 space-y-4">
                <h3 className="text-xl font-semibold text-left text-rose-400">Create a Poll</h3>
                <input type="text" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Poll question..." className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-lg p-2.5" />
                <div className="space-y-2">
                    {pollOptions.map((opt, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <input type="text" value={opt} onChange={e => handlePollOptionChange(index, e.target.value)} placeholder={`Option ${index + 1}`} className="flex-grow bg-slate-700 border border-slate-600 text-slate-100 rounded-lg p-2.5" />
                            {pollOptions.length > 2 && <button onClick={() => removePollOption(index)} className="p-2 text-slate-400 hover:text-red-400">&times;</button>}
                        </div>
                    ))}
                </div>
                {pollOptions.length < 5 && <button onClick={addPollOption} className="text-sm text-sky-400 hover:underline">Add option</button>}
            </div>
        )}
        
        {recordingState !== RecordingState.IDLE && !mediaPreviewUrl && !generatedImageUrl && !showPollCreator && (
            <div className="border-t border-b border-slate-700 py-6">
                {renderRecordingControls()}
            </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-around items-center border-y border-slate-700 py-2">
            <button onClick={handleStartRecording} disabled={!!mediaPreviewUrl} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Icon name="mic" className="w-6 h-6 text-rose-500"/> <span className="font-semibold text-slate-300">Voice</span>
            </button>
             <button onClick={() => handleFileSelectClick('image')} disabled={recordingState !== RecordingState.IDLE} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Icon name="photo" className="w-6 h-6 text-green-400"/> <span className="font-semibold text-slate-300">Photo</span>
            </button>
             <button onClick={() => handleFileSelectClick('video')} disabled={recordingState !== RecordingState.IDLE} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Icon name="video-camera" className="w-6 h-6 text-sky-400"/> <span className="font-semibold text-slate-300">Video</span>
            </button>
            <button onClick={() => setShowPollCreator(s => !s)} disabled={!!mediaPreviewUrl || recordingState !== RecordingState.IDLE} className={`flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${showPollCreator ? 'bg-rose-500/20' : ''}`}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                 <span className="font-semibold text-slate-300">Poll</span>
            </button>
        </div>

        {/* Image Generation Section */}
        <div className="space-y-4">
            <h3 className="text-xl font-semibold text-left text-rose-400">Add an AI Image (Optional)</h3>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={imagePrompt}
                    onChange={e => setImagePrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateImage(); }}
                    placeholder="Describe the image you want to create..."
                    className="flex-grow bg-slate-700 border border-slate-600 text-slate-100 rounded-lg p-2.5 focus:ring-rose-500 focus:border-rose-500 transition disabled:opacity-40"
                    disabled={isGeneratingImage || !!mediaPreviewUrl}
                />
                <button
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !imagePrompt.trim() || !canAffordImage || !!mediaPreviewUrl}
                    className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center min-w-[160px]"
                >
                    {isGeneratingImage 
                        ? <Icon name="logo" className="w-6 h-6 animate-spin"/> 
                        : `Generate (${IMAGE_GENERATION_COST} Coins)`
                    }
                </button>
            </div>
             {!canAffordImage && (
                <p className="text-xs text-yellow-500 text-left">You don't have enough coins. Watch an ad in the feed to earn more!</p>
             )}
            {isGeneratingImage && (
                <div className="aspect-square bg-slate-700/50 rounded-lg flex items-center justify-center flex-col gap-3 text-slate-300">
                    <Icon name="logo" className="w-12 h-12 text-rose-500 animate-spin"/>
                    <p>Generating your masterpiece...</p>
                </div>
            )}
            {generatedImageUrl && !isGeneratingImage && (
                <div className="relative group">
                    <img src={generatedImageUrl} alt={imagePrompt} className="aspect-square w-full rounded-lg object-cover" />
                    <button 
                        onClick={handleClearImage}
                        className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-50 group-hover:opacity-100 transition-opacity"
                        aria-label="Clear image"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            )}
        </div>
        
        <button 
          onClick={handlePost} 
          disabled={isPosting}
          className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg"
        >
            {isPosting ? 'Publishing...' : 'Post'}
        </button>
      </div>
    </div>
  );
};

export default CreatePostScreen;