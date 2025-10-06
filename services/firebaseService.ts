// @ts-nocheck
import {
    getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, onSnapshot,
    query, where, orderBy, limit, runTransaction, writeBatch, documentId,
    serverTimestamp, increment, arrayUnion, arrayRemove, deleteField, Timestamp,
    type DocumentSnapshot, type QuerySnapshot
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
                .filter(p => p.author && !blockedUserIds.includes(p.author.id))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            callback(allPosts);
        };
    
        const addListener = (q: any, source: string) => {
            const unsubscribe = onSnapshot(q, (snapshot) => {
                let changed = false;
                snapshot.docs.forEach(doc => {
                    // Using set to add or update is fine
                    postsMap.set(doc.id, docToPost(doc));
                    changed = true;
                });
                 snapshot.docChanges().forEach((change) => {
                    if (change.type === "removed") {
                        postsMap.delete(change.doc.id);
                        changed = true;
                    }
                });
                if (changed) processAndCallback();
            }, (error) => console.error(`Error fetching posts from ${source}:`, error));
            allUnsubscribes.push(unsubscribe);
        };
    
        // Query 1: Public posts from anyone
        const publicQuery = query(postsRef, where('author.privacySettings.postVisibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(50));
        addListener(publicQuery, 'public');
    
        // Query 2: User's own posts (of any visibility)
        const ownQuery = query(postsRef, where('author.id', '==', currentUserId), orderBy('createdAt', 'desc'), limit(50));
        addListener(ownQuery, 'own');
        
        // Query 3: Friends' posts (visibility 'friends')
        const friendChunks = [];
        for (let i = 0; i < friendIds.length; i += 10) {
            friendChunks.push(friendIds.slice(i, i + 10));
        }
    
        friendChunks.forEach((chunk, index) => {
            if (chunk.length > 0) {
                const friendsQuery = query(postsRef,
                    where('author.id', 'in', chunk),
                    where('author.privacySettings.postVisibility', '==', 'friends'),
                    orderBy('createdAt', 'desc'),
                    limit(30)
                );
                addListener(friendsQuery, `friends-chunk-${index}`);
            }
        });
    
        return () => {
            allUnsubscribes.forEach(unsub => unsub());
        };
    },

    listenToExplorePosts(currentUserId: string, callback: (posts: Post[]) => void) {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef,
            where('author.privacySettings.postVisibility', '==', 'public'),
            orderBy('createdAt', 'desc'),
            limit(50));
        return onSnapshot(q, (snapshot) => {
            const explorePosts = snapshot.docs
                .map(docToPost)
                .filter(post => post.author.id !== currentUserId && !post.isSponsored);
            callback(explorePosts);
        });
    },

    async getExplorePosts(currentUserId: string): Promise<Post[]> {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef,
            where('author.privacySettings.postVisibility', '==', 'public'),
            orderBy('createdAt', 'desc'),
            limit(50));
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(docToPost)
            .filter(post => post.author.id !== currentUserId && !post.isSponsored);
    },

    listenToReelsPosts(currentUserId: string, callback: (posts: Post[]) => void): () => void {
        const postsRef = collection(db, 'posts');
        const reelsMap = new Map<string, Post>();
        const unsubscribes: (() => void)[] = [];
    
        const processAndCallback = () => {
            const allReels = Array.from(reelsMap.values())
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            callback(allReels);
        };
    
        // Query 1: User's own reels. This is always safe.
        const ownQuery = query(postsRef,
            where('videoUrl', '!=', null),
            where('author.id', '==', currentUserId),
            orderBy('createdAt', 'desc')
        );
        const unsubOwn = onSnapshot(ownQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'removed') {
                    reelsMap.delete(change.doc.id);
                } else {
                    reelsMap.set(change.doc.id, docToPost(change.doc));
                }
            });
            processAndCallback();
        }, (error) => {
            console.error("Error fetching own reels:", error);
        });
        unsubscribes.push(unsubOwn);
    
        // Query 2: Public reels. This is the query that can fail.
        const publicQuery = query(postsRef,
            where('videoUrl', '!=', null),
            where('author.privacySettings.postVisibility', '==', 'public'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const unsubPublic = onSnapshot(publicQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                 if (change.doc.data().author.id === currentUserId) return; // Avoid duplicates
                if (change.type === 'removed') {
                    reelsMap.delete(change.doc.id);
                } else {
                    reelsMap.set(change.doc.id, docToPost(change.doc));
                }
            });
            processAndCallback();
        }, (error) => {
            // GRACEFUL FAILURE: If this fails, we log it but the app continues with just the user's own reels.
            console.warn("Could not fetch public reels due to permissions or data inconsistency. Only your own reels may be shown.", error.message);
        });
        unsubscribes.push(unsubPublic);
    
        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    },

    listenToPost(postId: string, callback: (post: Post | null) => void): () => void {
        const postRef = doc(db, 'posts', postId);
        return onSnapshot(postRef, (doc) => {
            if (doc.exists()) {
                callback(docToPost(doc));
            } else {
                callback(null);
            }
        }, (error) => {
            console.error(`Error listening to post ${postId}:`, error);
            callback(null);
        });
    },

    async createPost(
        postData: any,
        media: {
            mediaFiles?: File[];
            audioBlobUrl?: string | null;
            generatedImageBase64?: string | null;
        }
    ) {
        const { author: user, ...restOfPostData } = postData;
        
        const authorInfo: Author = {
            id: user.id,
            name: user.name,
            username: user.username,
            avatarUrl: user.avatarUrl,
            privacySettings: user.privacySettings,
        };

        const postToSave: any = {
            ...restOfPostData,
            author: authorInfo,
            createdAt: serverTimestamp(),
            reactions: {},
            commentCount: 0,
            comments: [],
        };

        const userId = user.id;

        if (media.mediaFiles && media.mediaFiles.length > 0) {
            // A post can be a single video or multiple images.
            if (media.mediaFiles[0].type.startsWith('video/')) {
                // If it's a video, we only upload the first one.
                const { url } = await uploadMediaToCloudinary(media.mediaFiles[0], `post_video_${userId}_${Date.now()}`);
                postToSave.videoUrl = url;
            } else {
                // If they are images, upload all of them and create imageDetails.
                const uploadResults = await Promise.all(
                    media.mediaFiles.map(file =>
                        uploadMediaToCloudinary(file, `post_image_${userId}_${Date.now()}_${Math.random()}`).then(result => result.url)
                    )
                );
        
                const imageCaptions = restOfPostData.imageCaptions || [];
                postToSave.imageDetails = uploadResults.map((url, index) => ({
                    id: `img_${Date.now()}_${index}`, // Unique ID for each image
                    url: url,
                    caption: imageCaptions[index] || '',
                }));
        
                // For legacy/preview purposes, set the first image as the main imageUrl.
                if (uploadResults.length > 0) {
                    postToSave.imageUrl = uploadResults[0];
                }
                // Clean up the temporary array passed from create post screen
                delete postToSave.imageCaptions;
            }
        }
        
        if (media.generatedImageBase64) {
            const blob = await fetch(media.generatedImageBase64).then(res => res.blob());
            const { url } = await uploadMediaToCloudinary(blob, `post_ai_${userId}_${Date.now()}.jpeg`);
            postToSave.imageUrl = url;
        }

        if (media.audioBlobUrl) {
            const audioBlob = await fetch(media.audioBlobUrl).then(r => r.blob());
            const { url } = await uploadMediaToCloudinary(audioBlob, `post_audio_${userId}_${Date.now()}.webm`);
            postToSave.audioUrl = url;
        }

        const newPostRef = await addDoc(collection(db, 'posts'), removeUndefined(postToSave));

        // --- Notification Logic for createPost ---
        // 1. Mentions
        if (postToSave.caption) {
            const mentionedUserIds = await _parseMentions(postToSave.caption);
            for (const mentionedId of mentionedUserIds) {
                await _createNotification(mentionedId, 'mention', user, {
                    post: { id: newPostRef.id, caption: postToSave.caption.substring(0, 50) }
                });
            }
        }
        // 2. Group Post
        if (postToSave.groupId) {
            const groupDoc = await getDoc(doc(db, 'groups', postToSave.groupId));
            if (groupDoc.exists()) {
                const group = groupDoc.data();
                const memberIdsToNotify = [...(group.admins || []).map(a => a.id), ...(group.moderators || []).map(m => m.id)];
                const uniqueIds = [...new Set(memberIdsToNotify)];
                for (const memberId of uniqueIds) {
                    await _createNotification(memberId, 'group_post', user, {
                        post: { id: newPostRef.id },
                        groupId: postToSave.groupId,
                        groupName: group.name,
                    });
                }
            }
        }
    },

    async deletePost(postId: string, userId: string): Promise<boolean> {
        const postRef = doc(db, 'posts', postId);
        try {
            const postDoc = await getDoc(postRef);
            if (!postDoc.exists()) {
                throw new Error("Post not found");
            }

            const postData = postDoc.data() as Post;
            if (postData.author.id !== userId) {
                const user = await firebaseService.getUserProfileById(userId);
                if (user?.role !== 'admin') {
                     console.error("Permission denied: User is not the author or an admin.");
                     return false;
                }
            }

            await deleteDoc(postRef);
            return true;

        } catch (error) {
            console.error("Error deleting post:", error);
            return false;
        }
    },

    async getPostsByIds(postIds: string[]): Promise<Post[]> {
        if (postIds.length === 0) return [];
        const postsRef = collection(db, 'posts');
        const postPromises: Promise<QuerySnapshot>[] = [];
        // Chunk the postIds array into chunks of 10 to stay within Firestore's limits for 'in' queries.
        for (let i = 0; i < postIds.length; i += 10) {
            const chunk = postIds.slice(i, i + 10);
            if (chunk.length > 0) {
                const q = query(postsRef, where(documentId(), 'in', chunk));
                postPromises.push(getDocs(q));
            }
        }
        const postSnapshots = await Promise.all(postPromises);
        const posts: Post[] = [];
        postSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => posts.push(docToPost(doc)));
        });
        return posts;
    },

    async savePost(userId: string, postId: string): Promise<boolean> {
        const userRef = doc(db, 'users', userId);
        try {
            await updateDoc(userRef, {
                savedPostIds: arrayUnion(postId)
            });
            return true;
        } catch (error) {
            console.error("Error saving post:", error);
            return false;
        }
    },

    async unsavePost(userId: string, postId: string): Promise<boolean> {
        const userRef = doc(db, 'users', userId);
        try {
            await updateDoc(userRef, {
                savedPostIds: arrayRemove(postId)
            });
            return true;
        } catch (error) {
            console.error("Error unsaving post:", error);
            return false;
        }
    },
    
    async reactToPost(postId: string, userId: string, newReaction: string): Promise<boolean> {
        const postRef = doc(db, 'posts', postId);
        const currentUser = await firebaseService.getUserProfileById(userId);
        if (!currentUser) return false;

        try {
            let postAuthorId: string | null = null;
            let postCaption: string = '';

            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) throw "Post does not exist!";
    
                const postData = postDoc.data() as Post;
                postAuthorId = postData.author.id;
                postCaption = postData.caption || '';

                const reactions = { ...(postData.reactions || {}) };
                const userPreviousReaction = reactions[userId];
    
                if (userPreviousReaction === newReaction) {
                    delete reactions[userId]; // User un-reacted
                } else {
                    reactions[userId] = newReaction;
                }
                
                transaction.update(postRef, { reactions });
            });

            // Send notification outside the transaction
            if (postAuthorId) {
                await _createNotification(postAuthorId, 'like', currentUser, {
                    post: { id: postId, caption: postCaption.substring(0, 50) }
                });
            }

            return true;
        } catch (e) {
            console.error("Reaction transaction failed:", e);
            return false;
        }
    },

    async reactToImage(postId: string, imageId: string, userId: string, newReaction: string): Promise<boolean> {
        const postRef = doc(db, 'posts', postId);
        try {
            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) throw "Post does not exist!";

                const postData = postDoc.data() as Post;
                const imageReactions = { ...(postData.imageReactions || {}) };

                if (!imageReactions[imageId]) {
                    imageReactions[imageId] = {};
                }

                const userPreviousReaction = imageReactions[imageId][userId];

                if (userPreviousReaction === newReaction) {
                    delete imageReactions[imageId][userId]; // User un-reacted by tapping the same emoji again
                } else {
                    imageReactions[imageId][userId] = newReaction;
                }

                // Clean up empty imageId keys
                if (Object.keys(imageReactions[imageId]).length === 0) {
                    delete imageReactions[imageId];
                }

                transaction.update(postRef, { imageReactions });
            });
            return true;
        } catch (e) {
            console.error("React to image transaction failed:", e);
            return false;
        }
    },

    async reactToComment(postId: string, commentId: string, userId: string, newReaction: string): Promise<boolean> {
        const postRef = doc(db, 'posts', postId);
        const currentUser = await firebaseService.getUserProfileById(userId);
        if (!currentUser) return false;
    
        try {
            let commentAuthorId: string | null = null;
            let postCaption: string = '';
            let commentText: string = '';
    
            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) throw "Post does not exist!";
    
                const postData = postDoc.data() as Post;
                postCaption = postData.caption || '';
                const comments = postData.comments || [];
                const commentIndex = comments.findIndex(c => c.id === commentId);
    
                if (commentIndex === -1) throw "Comment not found!";
    
                const comment = comments[commentIndex];
                commentAuthorId = comment.author.id;
                commentText = comment.text || `a ${comment.type} comment`;
                const reactions = { ...(comment.reactions || {}) };
                const userPreviousReaction = reactions[userId];
    
                if (userPreviousReaction === newReaction) {
                    delete reactions[userId]; // un-react
                } else {
                    reactions[userId] = newReaction;
                }
                
                comments[commentIndex].reactions = reactions;
    
                transaction.update(postRef, { comments });
            });
    
            if (commentAuthorId) {
                await _createNotification(commentAuthorId, 'like', currentUser, {
                    post: { id: postId, caption: postCaption.substring(0, 50) },
                    comment: { id: commentId, text: commentText.substring(0, 50) }
                });
            }
    
            return true;
        } catch (e) {
            console.error("React to comment transaction failed:", e);
            return false;
        }
    },
    
    async createComment(user: User, postId: string, data: { text?: string; imageFile?: File; audioBlob?: Blob; duration?: number; parentId?: string | null; imageId?: string }): Promise<Comment | null> {
        if (user.commentingSuspendedUntil && new Date(user.commentingSuspendedUntil) > new Date()) {
            console.warn(`User ${user.id} is suspended from commenting.`);
            return null;
        }
    
        const postRef = doc(db, 'posts', postId);
    
        const newComment: any = {
            id: doc(collection(db, 'posts')).id,
            postId,
            author: { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
            createdAt: Timestamp.now(),
            reactions: {},
            parentId: data.parentId || null,
            imageId: data.imageId || null,
        };
    
        if (data.audioBlob && data.duration) {
            newComment.type = 'audio';
            newComment.duration = data.duration;
            const { url } = await uploadMediaToCloudinary(data.audioBlob, `comment_audio_${newComment.id}.webm`);
            newComment.audioUrl = url;
        } else if (data.imageFile) {
            newComment.type = 'image';
            const { url } = await uploadMediaToCloudinary(data.imageFile, `comment_image_${newComment.id}.jpeg`);
            newComment.imageUrl = url;
        } else if (data.text) {
            newComment.type = 'text';
            newComment.text = data.text;
        } else {
            throw new Error("Comment must have content.");
        }
        
        const postDoc = await getDoc(postRef);
        if (!postDoc.exists()) throw new Error("Post not found");
        const postData = postDoc.data() as Post;

        await updateDoc(postRef, {
            comments: arrayUnion(removeUndefined(newComment)),
            commentCount: increment(1),
        });

        // --- Notification Logic for createComment ---
        const notificationOptions = { post: { id: postId, caption: postData.caption.substring(0, 50) } };
        const notificationCommentContext = { comment: { id: newComment.id, text: newComment.text?.substring(0, 50) }};

        // 1. Mentions
        if (newComment.text) {
            const mentionedUserIds = await _parseMentions(newComment.text);
            for (const mentionedId of mentionedUserIds) {
                await _createNotification(mentionedId, 'mention', user, { ...notificationOptions, ...notificationCommentContext });
            }
        }
        
        // 2. Notify post author and parent comment author
        const recipientsToNotify = new Set<string>();
        recipientsToNotify.add(postData.author.id); // Always consider notifying post author

        if (data.parentId) {
            const parentComment = postData.comments.find(c => c.id === data.parentId);
            if (parentComment) {
                recipientsToNotify.add(parentComment.author.id);
            }
        }
        
        for (const recipientId of recipientsToNotify) {
             await _createNotification(recipientId, 'comment', user, { ...notificationOptions, ...notificationCommentContext });
        }

        return { ...removeUndefined(newComment), createdAt: new Date().toISOString() } as Comment;
    },

    async editComment(postId: string, commentId: string, newText: string): Promise<void> {
        const postRef = doc(db, 'posts', postId);
        try {
            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) throw "Post does not exist!";
    
                const postData = postDoc.data() as Post;
                const comments = [...postData.comments] || [];
                const commentIndex = comments.findIndex(c => c.id === commentId);
    
                if (commentIndex === -1) throw "Comment not found!";
    
                comments[commentIndex].text = newText;
                comments[commentIndex].updatedAt = new Date().toISOString();
    
                transaction.update(postRef, { comments });
            });
        } catch (e) {
            console.error("Edit comment transaction failed:", e);
        }
    },

    async deleteComment(postId: string, commentId: string): Promise<void> {
        const postRef = doc(db, 'posts', postId);
        try {
            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) throw "Post does not exist!";
    
                const postData = postDoc.data() as Post;
                const comments = [...postData.comments] || [];
                const commentIndex = comments.findIndex(c => c.id === commentId);

                if (commentIndex === -1) return;

                comments[commentIndex].isDeleted = true;
                comments[commentIndex].text = undefined;
                comments[commentIndex].audioUrl = undefined;
                comments[commentIndex].imageUrl = undefined;
                comments[commentIndex].reactions = {};

                transaction.update(postRef, { comments });
            });
        } catch (e) {
            console.error("Delete comment transaction failed:", e);
        }
    },

    async voteOnPoll(userId: string, postId: string, optionIndex: number): Promise<Post | null> {
        const postRef = doc(db, 'posts', postId);
        try {
            let updatedPostData: Post | null = null;
            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) {
                    throw "Post does not exist!";
                }
    
                const postData = postDoc.data() as Post;
                if (!postData.poll) {
                    throw "This post does not have a poll.";
                }
    
                const hasVoted = postData.poll.options.some(opt => opt.votedBy.includes(userId));
                if (hasVoted) {
                    updatedPostData = docToPost(postDoc);
                    return;
                }
    
                if (optionIndex < 0 || optionIndex >= postData.poll.options.length) {
                    throw "Invalid poll option index.";
                }
    
                const updatedOptions = postData.poll.options.map((option, index) => {
                    if (index === optionIndex) {
                        return {
                            ...option,
                            votes: option.votes + 1,
                            votedBy: [...option.votedBy, userId],
                        };
                    }
                    return option;
                });
    
                const updatedPoll = { ...postData.poll, options: updatedOptions };
                transaction.update(postRef, { poll: updatedPoll });
                
                updatedPostData = { ...docToPost(postDoc), poll: updatedPoll };
            });
            return updatedPostData;
        } catch (e) {
            console.error("Vote on poll transaction failed:", e);
            return null;
        }
    },

    async markBestAnswer(userId: string, postId: string, commentId: string): Promise<Post | null> {
        const postRef = doc(db, 'posts', postId);
        try {
            const postDoc = await getDoc(postRef);
            if (!postDoc.exists()) {
                throw "Post does not exist!";
            }
            const postData = postDoc.data() as Post;
    
            if (postData.author.id !== userId) {
                console.error("Permission denied. User is not the author.");
                return null;
            }
            
            const commentExists = postData.comments.some(c => c.id === commentId);
            if (!commentExists) {
                 throw "Comment does not exist on this post.";
            }
    
            await updateDoc(postRef, { bestAnswerId: commentId });
            
            const updatedPostDoc = await getDoc(postRef);
            return docToPost(updatedPostDoc);
        } catch (e) {
            console.error("Marking best answer failed:", e);
            return null;
        }
    },

    // --- Messages ---
    getChatId: (user1Id: string, user2Id: string): string => {
        return [user1Id, user2Id].sort().join('_');
    },

    async ensureChatDocumentExists(user1: User, user2: User): Promise<string> {
        const chatId = firebaseService.getChatId(user1.id, user2.id);
        const chatRef = doc(db, 'chats', chatId);
    
        let enrichedUser1 = { ...user1 };
        let enrichedUser2 = { ...user2 };
    
        try {
            if (!enrichedUser1.username) {
                console.warn(`Incomplete current user object (ID: ${enrichedUser1.id}). Fetching full profile.`);
                const fullProfile = await firebaseService.getUserProfileById(enrichedUser1.id);
                if (fullProfile) enrichedUser1 = fullProfile;
            }
            if (!enrichedUser2.username) {
                console.warn(`Incomplete peer user object (ID: ${enrichedUser2.id}). Fetching full profile.`);
                const fullProfile = await firebaseService.getUserProfileById(enrichedUser2.id);
                if (fullProfile) enrichedUser2 = fullProfile;
            }
            
            if (!enrichedUser1.username || !enrichedUser2.username) {
                throw new Error(`Could not resolve a username for one of the chat participants (${enrichedUser1.id}, ${enrichedUser2.id}). This may be a data consistency issue.`);
            }
            
            await setDoc(chatRef, {
                participants: [enrichedUser1.id, enrichedUser2.id],
                participantInfo: {
                    [enrichedUser1.id]: { name: enrichedUser1.name, username: enrichedUser1.username, avatarUrl: enrichedUser1.avatarUrl },
                    [enrichedUser2.id]: { name: enrichedUser2.name, username: enrichedUser2.username, avatarUrl: enrichedUser2.avatarUrl }
                },
                lastUpdated: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error("Error ensuring chat document exists:", error);
            throw error;
        }
        return chatId;
    },

    listenToMessages(chatId: string, callback: (messages: Message[]) => void): () => void {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));
        return onSnapshot(q, snapshot => {
            const messages = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                } as Message;
            });
            callback(messages);
        });
    },

    listenToConversations(userId: string, callback: (convos: Conversation[]) => void): () => void {
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', userId), orderBy('lastUpdated', 'desc'));

        return onSnapshot(q, async (snapshot) => {
            const conversations: Conversation[] = [];
            for (const doc of snapshot.docs) {
                const data = doc.data();
                const peerId = data.participants.find((pId: string) => pId !== userId);
                if (!peerId) continue;

                const peerInfo = data.participantInfo[peerId];
                if (!peerInfo) continue;

                const peerUser: User = {
                    id: peerId,
                    name: peerInfo.name,
                    avatarUrl: peerInfo.avatarUrl,
                    username: peerInfo.username,
                } as User;
                
                const lastMessageData = data.lastMessage;
                if (!lastMessageData) continue;
                
                const isPeerTyping = data.typing?.[peerId] === true;

                conversations.push({
                    peer: peerUser,
                    lastMessage: {
                        ...lastMessageData,
                        createdAt: lastMessageData.createdAt instanceof Timestamp ? lastMessageData.createdAt.toDate().toISOString() : lastMessageData.createdAt,
                    },
                    unreadCount: data.unreadCount?.[userId] || 0,
                    isTyping: isPeerTyping,
                });
            }
            callback(conversations);
        });
    },

    async sendMessage(chatId: string, sender: User, recipient: User, messageContent: any): Promise<void> {
        const chatRef = doc(db, 'chats', chatId);
        const messagesRef = collection(chatRef, 'messages');
        
        const newMessage: Omit<Message, 'id' | 'createdAt'> = {
            senderId: sender.id,
            recipientId: recipient.id,
            type: messageContent.type,
            read: false,
        };

        if (messageContent.text) newMessage.text = messageContent.text;
        if (messageContent.duration) newMessage.duration = messageContent.duration;
        if (messageContent.replyTo) newMessage.replyTo = messageContent.replyTo;
        if (messageContent.mediaUrl) newMessage.mediaUrl = messageContent.mediaUrl; // Added for animated emojis

        if (messageContent.mediaFile) {
            const { url } = await uploadMediaToCloudinary(messageContent.mediaFile, `chat_${chatId}_${Date.now()}`);
            newMessage.mediaUrl = url;
            if(messageContent.type === 'video') {
                newMessage.type = 'video';
            } else {
                newMessage.type = 'image';
            }
        } else if (messageContent.audioBlob) {
            const { url } = await uploadMediaToCloudinary(messageContent.audioBlob, `chat_audio_${chatId}_${Date.now()}.webm`);
            newMessage.audioUrl = url;
            newMessage.type = 'audio';
        }

        const messageWithTimestamp = {
            ...newMessage,
            createdAt: serverTimestamp(),
        };
        
        const docRef = await addDoc(messagesRef, removeUndefined(messageWithTimestamp));

        const lastMessageForDoc = removeUndefined({
            ...newMessage,
            id: docRef.id,
            createdAt: new Date().toISOString()
        });

        await updateDoc(chatRef, {
            lastMessage: lastMessageForDoc,
            lastUpdated: serverTimestamp(),
            [`unreadCount.${recipient.id}`]: increment(1)
        });
    },

    async markMessagesAsRead(chatId: string, userId: string): Promise<void> {
        const chatRef = doc(db, 'chats', chatId);
        await updateDoc(chatRef, {
            [`unreadCount.${userId}`]: 0
        });
    },

    async unsendMessage(chatId: string, messageId: string, userId: string): Promise<void> {
        const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
        const messageDoc = await getDoc(messageRef);
        if (messageDoc.exists() && messageDoc.data()?.senderId === userId) {
            await updateDoc(messageRef, {
                isDeleted: true,
                text: deleteField(),
                mediaUrl: deleteField(),
                audioUrl: deleteField(),
                reactions: {}
            });
            const chatRef = doc(db, 'chats', chatId);
            const chatDoc = await getDoc(chatRef);
            if(chatDoc.exists() && chatDoc.data().lastMessage.id === messageId) {
                await updateDoc(chatRef, {
                    'lastMessage.isDeleted': true,
                    'lastMessage.text': deleteField(),
                    'lastMessage.mediaUrl': deleteField(),
                    'lastMessage.audioUrl': deleteField(),
                });
            }
        }
    },

    async reactToMessage(chatId: string, messageId: string, userId: string, emoji: string): Promise<void> {
        const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
        await runTransaction(db, async (transaction) => {
            const messageDoc = await transaction.get(messageRef);
            if (!messageDoc.exists()) throw "Message not found";

            const reactions = messageDoc.data()?.reactions || {};
            const previousReaction = Object.keys(reactions).find(key => reactions[key].includes(userId));

            if (previousReaction) {
                reactions[previousReaction] = reactions[previousReaction].filter((id: string) => id !== userId);
            }

            if (previousReaction !== emoji) {
                if (!reactions[emoji]) {
                    reactions[emoji] = [];
                }
                reactions[emoji].push(userId);
            }
            
            for (const key in reactions) {
                if (reactions[key].length === 0) {
                    delete reactions[key];
                }
            }
            
            transaction.update(messageRef, { reactions });
        });
    },

    async deleteChatHistory(chatId: string): Promise<void> {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, limit(500));
        const snapshot = await getDocs(q); 
        if (snapshot.size === 0) {
            await deleteDoc(doc(db, 'chats', chatId));
            return;
        }
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return firebaseService.deleteChatHistory(chatId);
    },

    async getChatSettings(chatId: string): Promise<ChatSettings | null> {
        const docRef = doc(db, 'chatSettings', chatId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() as ChatSettings : null;
    },

    listenToChatSettings(chatId: string, callback: (settings: ChatSettings | null) => void): () => void {
        const settingsRef = doc(db, 'chatSettings', chatId);
        return onSnapshot(settingsRef, doc => {
            const settings = doc.exists() ? (doc.data() as ChatSettings) : { theme: 'default' };
            callback(settings);
        });
    },

    async updateChatSettings(chatId: string, settings: Partial<ChatSettings>): Promise<void> {
        const settingsRef = doc(db, 'chatSettings', chatId);
        await setDoc(settingsRef, removeUndefined(settings), { merge: true });
    },
    async updateTypingStatus(chatId: string, userId: string, isTyping: boolean): Promise<void> {
        const chatRef = doc(db, 'chats', chatId);
        try {
            const updateData = {
                [`typing.${userId}`]: isTyping
            };
            // also update lastUpdated to make sure the conversation bubbles up if needed
            if(isTyping) {
                updateData.lastUpdated = serverTimestamp();
            }
            await updateDoc(chatRef, updateData);
        } catch (error) {
            console.warn(`Could not update typing status for chat ${chatId}:`, error);
        }
    },
    // --- Profile & Security ---
    async getUserProfile(username: string): Promise<User | null> {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username.toLowerCase()), limit(1));
        const userQuery = await getDocs(q);
        if (!userQuery.empty) {
            return docToUser(userQuery.docs[0]);
        }
        return null;
    },

    listenToUserProfile(username: string, callback: (user: User | null) => void) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username.toLowerCase()), limit(1));
        return onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                callback(docToUser(snapshot.docs[0]));
            } else {
                callback(null);
            }
        },
        (error) => {
            console.error("Error listening to user profile by username:", error);
            callback(null);
        });
    },

    async getPostsByUser(userId: string): Promise<Post[]> {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, where('author.id', '==', userId), orderBy('createdAt', 'desc'));
        const postQuery = await getDocs(q);
        return postQuery.docs.map(docToPost);
    },

    listenToPostsByUser(userId: string, callback: (posts: Post[]) => void): () => void {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, where('author.id', '==', userId), orderBy('createdAt', 'desc'));
        return onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(docToPost);
            callback(posts);
        }, (error) => {
            console.error(`Error listening to posts for user ${userId}:`, error);
            callback([]);
        });
    },
    
    async updateProfile(userId: string, updates: Partial<User>): Promise<void> {
        const userRef = doc(db, 'users', userId);
        const updatesToSave = { ...updates };
    
        if (updates.name) {
            updatesToSave.name_lowercase = updates.name.toLowerCase();
        }
    
        try {
            await updateDoc(userRef, removeUndefined(updatesToSave));
        } catch (error) {
            console.error("Error updating user profile in Firebase:", error);
            throw error;
        }
    },

    async updateProfilePicture(userId: string, base64Url: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
        const userRef = doc(db, 'users', userId);
        try {
            const blob = await fetch(base64Url).then(res => res.blob());
            const { url: newAvatarUrl } = await uploadMediaToCloudinary(blob, `avatar_${userId}_${Date.now()}.jpeg`);

            await updateDoc(userRef, { avatarUrl: newAvatarUrl });

            const userDoc = await getDoc(userRef);
            if (!userDoc.exists()) return null;
            const user = docToUser(userDoc);

            const authorInfo: Author = {
                id: user.id,
                name: user.name,
                username: user.username,
                avatarUrl: newAvatarUrl,
                privacySettings: user.privacySettings,
            };

            const newPostData = {
                author: authorInfo,
                caption: caption || `${user.name.split(' ')[0]} updated their profile picture.`,
                captionStyle: captionStyle,
                createdAt: serverTimestamp(),
                postType: 'profile_picture_change',
                newPhotoUrl: newAvatarUrl,
                reactions: {},
                commentCount: 0,
                comments: [],
                duration: 0,
            };

            const postRef = await addDoc(collection(db, 'posts'), removeUndefined(newPostData));
            const newPostDoc = await getDoc(postRef);
            const newPost = docToPost(newPostDoc);

            const updatedUser = { ...user, avatarUrl: newAvatarUrl };
            return { updatedUser, newPost };

        } catch (error) {
            console.error("Error updating profile picture:", error);
            return null;
        }
    },

    async updateCoverPhoto(userId: string, base64Url: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
        const userRef = doc(db, 'users', userId);
        try {
            const blob = await fetch(base64Url).then(res => res.blob());
            const { url: newCoverUrl } = await uploadMediaToCloudinary(blob, `cover_${userId}_${Date.now()}.jpeg`);

            await updateDoc(userRef, { coverPhotoUrl: newCoverUrl });

            const userDoc = await getDoc(userRef);
            if (!userDoc.exists()) return null;
            const user = docToUser(userDoc);

            const authorInfo: Author = {
                id: user.id,
                name: user.name,
                username: user.username,
                avatarUrl: user.avatarUrl,
                privacySettings: user.privacySettings,
            };

            const newPostData = {
                author: authorInfo,
                caption: caption || `${user.name.split(' ')[0]} updated their cover photo.`,
                captionStyle: captionStyle,
                createdAt: serverTimestamp(),
                postType: 'cover_photo_change',
                newPhotoUrl: newCoverUrl,
                reactions: {},
                commentCount: 0,
                comments: [],
                duration: 0,
            };

            const postRef = await addDoc(collection(db, 'posts'), removeUndefined(newPostData));
            const newPostDoc = await getDoc(postRef);
            const newPost = docToPost(newPostDoc);

            const updatedUser = { ...user, coverPhotoUrl: newCoverUrl };
            return { updatedUser, newPost };

        } catch (error) {
            console.error("Error updating cover photo:", error);
            return null;
        }
    },
    
     async searchUsers(query: string): Promise<User[]> {
        const lowerQuery = query.toLowerCase();
        const usersRef = collection(db, 'users');
        const nameQuery = query(usersRef, where('name_lowercase', '>=', lowerQuery), where('name_lowercase', '<=', lowerQuery + '\uf8ff'));
        const usernameQuery = query(usersRef, where('username', '>=', lowerQuery), where('username', '<=', lowerQuery + '\uf8ff'));
        
        const [nameSnapshot, usernameSnapshot] = await Promise.all([getDocs(nameQuery), getDocs(usernameQuery)]);
        
        const results = new Map<string, User>();
        nameSnapshot.docs.forEach(d => results.set(d.id, docToUser(d)));
        usernameSnapshot.docs.forEach(d => results.set(d.id, docToUser(d)));
        
        return Array.from(results.values());
    },

    async blockUser(currentUserId: string, targetUserId: string): Promise<boolean> {
        const currentUserRef = doc(db, 'users', currentUserId);
        const targetUserRef = doc(db, 'users', targetUserId);
        try {
            const batch = writeBatch(db);
            batch.update(currentUserRef, { blockedUserIds: arrayUnion(targetUserId) });
            batch.update(targetUserRef, { blockedUserIds: arrayUnion(currentUserId) });
            await batch.commit();
            return true;
        } catch (error) {
            console.error("Failed to block user:", error);
            return false;
        }
    },

    async unblockUser(currentUserId: string, targetUserId: string): Promise<boolean> {
        const currentUserRef = doc(db, 'users', currentUserId);
        const targetUserRef = doc(db, 'users', targetUserId);
        try {
            const batch = writeBatch(db);
            batch.update(currentUserRef, { blockedUserIds: arrayRemove(targetUserId) });
            batch.update(targetUserRef, { blockedUserIds: arrayRemove(currentUserId) });
            await batch.commit();
            return true;
        } catch (error) {
            console.error("Failed to unblock user:", error);
            return false;
        }
    },

    async deactivateAccount(userId: string): Promise<boolean> {
        const userRef = doc(db, 'users', userId);
        try {
            await updateDoc(userRef, { isDeactivated: true });
            return true;
        } catch (error) {
            console.error("Failed to deactivate account:", error);
            return false;
        }
    },

    // --- Voice Coins ---
    async updateVoiceCoins(userId: string, amount: number): Promise<boolean> {
        const userRef = doc(db, 'users', userId);
        try {
            await updateDoc(userRef, {
                voiceCoins: increment(amount)
            });
            return true;
        } catch (e) {
            console.error("Failed to update voice coins:", e);
            return false;
        }
    },

    // --- Reporting ---
    async createReport(reporter: User, content: Post | Comment | User, contentType: 'post' | 'comment' | 'user', reason: string): Promise<boolean> {
        try {
            const reportedUserId = 'author' in content ? content.author.id : content.id;
            const reportData: Omit<Report, 'id'> = {
                reporterId: reporter.id,
                reporterName: reporter.name,
                reportedUserId: reportedUserId,
                reportedContentId: content.id,
                reportedContentType: contentType,
                reason: reason,
                status: 'pending',
                createdAt: new Date().toISOString(),
            };
            await addDoc(collection(db, 'reports'), reportData);
            return true;
        } catch (error) {
            console.error("Error creating report:", error);
            return false;
        }
    },
    
    // --- Ads (for FeedScreen) ---
    async getInjectableStoryAd(currentUser: User): Promise<Story | null> {
        const q = query(collection(db, 'campaigns'), where('status', '==', 'active'), where('adType', '==', 'story'), limit(10));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const campaigns = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as Campaign[];
        const matchingCampaign = campaigns.find(c => matchesTargeting(c, currentUser));

        if (matchingCampaign) {
            const sponsor = await firebaseService.getUserProfileById(matchingCampaign.sponsorId);
            if (!sponsor) return null;

            return {
                id: `ad_${matchingCampaign.id}`,
                author: sponsor,
                type: 'image',
                contentUrl: matchingCampaign.imageUrl,
                duration: 10,
                createdAt: new Date().toISOString(),
                viewedBy: [],
                privacy: 'public',
                isSponsored: true,
                sponsorName: matchingCampaign.sponsorName,
                sponsorAvatar: sponsor.avatarUrl,
                campaignId: matchingCampaign.id,
                ctaLink: matchingCampaign.websiteUrl,
            };
        }
        return null;
    },

    async getInjectableAd(currentUser: User): Promise<Post | null> {
        const q = query(collection(db, 'campaigns'), where('status', '==', 'active'), where('adType', '==', 'feed'), limit(20));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const campaigns = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as Campaign[];
        const matchingCampaign = campaigns.find(c => matchesTargeting(c, currentUser));

        if (matchingCampaign) {
            const sponsor = await firebaseService.getUserProfileById(matchingCampaign.sponsorId);
            if (!sponsor) return null;

            return {
                id: `ad_${matchingCampaign.id}`,
                author: sponsor,
                caption: matchingCampaign.caption,
                createdAt: new Date().toISOString(),
                imageUrl: matchingCampaign.imageUrl,
                videoUrl: matchingCampaign.videoUrl,
                audioUrl: matchingCampaign.audioUrl,
                duration: 0,
                reactions: {},
                commentCount: 0,
                comments: [],
                isSponsored: true,
                sponsorName: matchingCampaign.sponsorName,
                campaignId: matchingCampaign.id,
                sponsorId: matchingCampaign.sponsorId,
                websiteUrl: matchingCampaign.websiteUrl,
                allowDirectMessage: matchingCampaign.allowDirectMessage,
                allowLeadForm: matchingCampaign.allowLeadForm,
            };
        }
        return null;
    },

    async leaveGroup(userId: string, groupId: string): Promise<boolean> {
        const groupRef = doc(db, 'groups', groupId);
        const userRef = doc(db, 'users', userId);
        const user = await firebaseService.getUserProfileById(userId);
        if (!user) return false;
        const memberObject = { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl };
        try {
            await updateDoc(groupRef, {
                members: arrayRemove(memberObject),
                memberIds: arrayRemove(userId),
                memberCount: increment(-1),
                admins: arrayRemove(memberObject),
                moderators: arrayRemove(memberObject),
            });
            await updateDoc(userRef, { groupIds: arrayRemove(groupId) });
            return true;
        } catch (error) {
            console.error("Error leaving group:", error);
            return false;
        }
    },

    // --- Rooms ---
    listenToRoom(roomId: string, type: 'audio' | 'video', callback: (room: any | null) => void): () => void {
        const collectionName = type === 'audio' ? 'liveAudioRooms' : 'liveVideoRooms';
        const roomRef = doc(db, collectionName, roomId);
        return onSnapshot(roomRef, (doc) => {
            if (doc.exists()) {
                callback({ id: doc.id, ...doc.data() });
            } else {
                callback(null);
            }
        });
    },
    async joinLiveAudioRoom(userId: string, roomId: string): Promise<void> {
        const user = await firebaseService.getUserProfileById(userId);
        if (!user) return;
        const roomRef = doc(db, 'liveAudioRooms', roomId);
        const author = { id: user.id, name: user.name, avatarUrl: user.avatarUrl, username: user.username };
        await updateDoc(roomRef, { listeners: arrayUnion(author) });
    },
    async joinLiveVideoRoom(userId: string, roomId: string): Promise<void> {
        const user = await firebaseService.getUserProfileById(userId);
        if (!user) return;
        const roomRef = doc(db, 'liveVideoRooms', roomId);
        const participantState: VideoParticipantState = { id: user.id, name: user.name, avatarUrl: user.avatarUrl, username: user.username, isMuted: true, isCameraOff: true };
        await updateDoc(roomRef, { participants: arrayUnion(participantState) });
    },
    async leaveLiveAudioRoom(userId: string, roomId: string): Promise<void> {
        const user = await firebaseService.getUserProfileById(userId);
        if (!user) return;
        const roomRef = doc(db, 'liveAudioRooms', roomId);
        const author = { id: user.id, name: user.name, avatarUrl: user.avatarUrl, username: user.username };
        await updateDoc(roomRef, {
            listeners: arrayRemove(author),
            speakers: arrayRemove(author),
            raisedHands: arrayRemove(userId),
        });
    },
    async leaveLiveVideoRoom(userId: string, roomId: string): Promise<void> {
        const roomRef = doc(db, 'liveVideoRooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (roomDoc.exists()) {
            const roomData = roomDoc.data() as LiveVideoRoom;
            const updatedParticipants = roomData.participants.filter(p => p.id !== userId);
            await updateDoc(roomRef, { participants: updatedParticipants });
        }
    },
    async endLiveAudioRoom(userId: string, roomId: string): Promise<void> {
        const roomRef = doc(db, 'liveAudioRooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (roomDoc.exists() && roomDoc.data().host.id === userId) {
            await updateDoc(roomRef, { status: 'ended' });
        }
    },
    async endLiveVideoRoom(userId: string, roomId: string): Promise<void> {
        const roomRef = doc(db, 'liveVideoRooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (roomDoc.exists() && roomDoc.data().host.id === userId) {
            await updateDoc(roomRef, { status: 'ended' });
        }
    },
    async getAudioRoomDetails(roomId: string): Promise<LiveAudioRoom | null> {
        const roomRef = doc(db, 'liveAudioRooms', roomId);
        const roomDoc = await getDoc(roomRef);
        return roomDoc.exists() ? { id: roomDoc.id, ...roomDoc.data() } as LiveAudioRoom : null;
    },
    async getRoomDetails(roomId: string, type: 'audio' | 'video'): Promise<any | null> {
        const collectionName = type === 'audio' ? 'liveAudioRooms' : 'liveVideoRooms';
        const roomRef = doc(db, collectionName, roomId);
        const roomDoc = await getDoc(roomRef);
        return roomDoc.exists() ? { id: roomDoc.id, ...roomDoc.data() } : null;
    },
    async raiseHandInAudioRoom(userId: string, roomId: string): Promise<void> {
        const roomRef = doc(db, 'liveAudioRooms', roomId);
        await updateDoc(roomRef, { raisedHands: arrayUnion(userId) });
    },
    async inviteToSpeakInAudioRoom(hostId: string, userId: string, roomId: string): Promise<void> {
        const roomRef = doc(db, 'liveAudioRooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (!roomDoc.exists() || roomDoc.data().host.id !== hostId) return;
        const user = await firebaseService.getUserProfileById(userId);
        if (!user) return;
        const author = { id: user.id, name: user.name, avatarUrl: user.avatarUrl, username: user.username };
        await updateDoc(roomRef, {
            speakers: arrayUnion(author),
            listeners: arrayRemove(author),
            raisedHands: arrayRemove(userId),
        });
    },
    async moveToAudienceInAudioRoom(hostId: string, userId: string, roomId: string): Promise<void> {
        const roomRef = doc(db, 'liveAudioRooms', roomId);
        const roomDoc = await getDoc(roomRef);
        if (!roomDoc.exists() || roomDoc.data().host.id !== hostId) return;
        const user = await firebaseService.getUserProfileById(userId);
        if (!user) return;
        const author = { id: user.id, name: user.name, avatarUrl: user.avatarUrl, username: user.username };
        await updateDoc(roomRef, {
            speakers: arrayRemove(author),
            listeners: arrayUnion(author),
        });
    },
    listenToLiveAudioRoomMessages(roomId: string, callback: (messages: LiveAudioRoomMessage[]) => void): () => void {
        const messagesRef = collection(db, 'liveAudioRooms', roomId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiveAudioRoomMessage)));
        });
    },
    async sendLiveAudioRoomMessage(roomId: string, sender: User, text: string, isHost: boolean, isSpeaker: boolean): Promise<void> {
        const messagesRef = collection(db, 'liveAudioRooms', roomId, 'messages');
        await addDoc(messagesRef, {
            sender: { id: sender.id, name: sender.name, avatarUrl: sender.avatarUrl, username: sender.username },
            text, isHost, isSpeaker, reactions: {}, createdAt: serverTimestamp(),
        });
    },
    async reactToLiveAudioRoomMessage(roomId: string, messageId: string, userId: string, emoji: string): Promise<void> {
        const messageRef = doc(db, 'liveAudioRooms', roomId, 'messages', messageId);
        await runTransaction(db, async (transaction) => {
            const messageDoc = await transaction.get(messageRef);
            if (!messageDoc.exists()) return;
            const reactions = messageDoc.data().reactions || {};
            const userIds = reactions[emoji] || [];
            if (!userIds.includes(userId)) {
                userIds.push(userId);
            }
            reactions[emoji] = userIds;
            transaction.update(messageRef, { reactions });
        });
    },
    listenToLiveVideoRoomMessages(roomId: string, callback: (messages: LiveVideoRoomMessage[]) => void): () => void {
        const messagesRef = collection(db, 'liveVideoRooms', roomId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LiveVideoRoomMessage)));
        });
    },
    async sendLiveVideoRoomMessage(roomId: string, sender: User, text: string): Promise<void> {
        const messagesRef = collection(db, 'liveVideoRooms', roomId, 'messages');
        await addDoc(messagesRef, {
            sender: { id: sender.id, name: sender.name, avatarUrl: sender.avatarUrl, username: sender.username },
            text, createdAt: serverTimestamp(),
        });
    },
    async updateParticipantStateInVideoRoom(roomId: string, userId: string, updates: Partial<VideoParticipantState>): Promise<void> {
        const roomRef = doc(db, 'liveVideoRooms', roomId);
        await runTransaction(db, async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists()) return;
            const roomData = roomDoc.data() as LiveVideoRoom;
            const participants = roomData.participants.map(p => p.id === userId ? { ...p, ...updates } : p);
            transaction.update(roomRef, { participants });
        });
    },

    // --- 1-on-1 Calls ---
    async createCall(caller: User, callee: User, chatId: string, type: 'audio' | 'video'): Promise<string> {
        const callRef = doc(collection(db, 'calls'));
        const callData: Omit<Call, 'id'> = {
            caller: { id: caller.id, name: caller.name, username: caller.username, avatarUrl: caller.avatarUrl },
            callee: { id: callee.id, name: callee.name, username: callee.username, avatarUrl: callee.avatarUrl },
            chatId,
            type,
            status: 'ringing',
            createdAt: new Date().toISOString(),
        };
        await setDoc(callRef, callData);
        return callRef.id;
    },

    listenForIncomingCalls(userId: string, callback: (call: Call | null) => void): () => void {
        const callsRef = collection(db, 'calls');
        const q = query(callsRef,
            where('callee.id', '==', userId),
            where('status', '==', 'ringing'),
            limit(1));

        return onSnapshot(q, snapshot => {
            if (snapshot.empty) {
                callback(null);
                return;
            }
            const doc = snapshot.docs[0];
            const data = doc.data();
            const call: Call = {
                id: doc.id,
                ...data,
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            } as Call;
            callback(call);
        });
    },

    listenToCall(callId: string, callback: (call: Call | null) => void): () => void {
        const callRef = doc(db, 'calls', callId);
        return onSnapshot(callRef, doc => {
            if (doc.exists()) {
                const data = doc.data();
                 const call: Call = {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
                    endedAt: data.endedAt instanceof Timestamp ? data.endedAt.toDate().toISOString() : data.endedAt,
                } as Call;
                callback(call);
            } else {
                callback(null);
            }
        });
    },

    async updateCallStatus(callId: string, status: Call['status']): Promise<void> {
        const callRef = doc(db, 'calls', callId);
        const updateData: { status: Call['status'], endedAt?: any } = { status };

        const callDocBeforeUpdate = await getDoc(callRef);
        const callDataBeforeUpdate = callDocBeforeUpdate.data() as Call;

        if (['ended', 'rejected', 'missed', 'declined'].includes(status)) {
            updateData.endedAt = serverTimestamp();
        }
        await updateDoc(callRef, updateData);

        if (['ended', 'rejected', 'missed', 'declined'].includes(status) && callDataBeforeUpdate) {
            let durationInSeconds = 0;
            if (callDataBeforeUpdate.status === 'active' && status === 'ended') {
                const start = new Date(callDataBeforeUpdate.createdAt);
                const end = new Date();
                durationInSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
            }

            const historyMessage: any = {
                senderId: callDataBeforeUpdate.caller.id,
                recipientId: callDataBeforeUpdate.callee.id,
                type: 'call_history',
                read: false,
                createdAt: serverTimestamp(),
                callType: callDataBeforeUpdate.type,
                callStatus: status,
            };

            if (durationInSeconds > 0) {
                historyMessage.callDuration = durationInSeconds;
            }

            const chatId = callDataBeforeUpdate.chatId;
            const chatRef = doc(db, 'chats', chatId);
            const messagesRef = collection(chatRef, 'messages');
            
            const messageDocRef = await addDoc(messagesRef, historyMessage);
            const lastMessageForDoc = removeUndefined({ ...historyMessage, id: messageDocRef.id, createdAt: new Date().toISOString() });
            
            await updateDoc(chatRef, {
                lastMessage: lastMessageForDoc,
                lastUpdated: serverTimestamp()
            });

            setTimeout(() => {
                deleteDoc(callRef).catch(e => console.error("Failed to clean up call document:", e));
            }, 5000);
        }
    },

    // --- Rooms, Campaigns, Stories, Groups, Admin, etc. ---
    listenToLiveAudioRooms: (callback: (rooms: LiveAudioRoom[]) => void) => onSnapshot(query(collection(db, 'liveAudioRooms'), where('status', '==', 'live')), s => callback(s.docs.map(d => ({id: d.id, ...d.data()} as LiveAudioRoom)))),
    listenToLiveVideoRooms: (callback: (rooms: LiveVideoRoom[]) => void) => onSnapshot(query(collection(db, 'liveVideoRooms'), where('status', '==', 'live')), s => callback(s.docs.map(d => ({id: d.id, ...d.data()} as LiveVideoRoom)))),
    createLiveAudioRoom: async (host: User, topic: string) => { 
        try {
            const hostAuthor = { id: host.id, name: host.name, avatarUrl: host.avatarUrl, username: host.username };
            const roomData = {
                host: hostAuthor,
                topic,
                speakers: [hostAuthor],
                listeners: [],
                raisedHands: [],
                createdAt: serverTimestamp(),
                status: 'live',
            };
            const ref = await addDoc(collection(db, 'liveAudioRooms'), roomData);
            return {
                ...roomData,
                id: ref.id,
                createdAt: new Date().toISOString(), // return an approximate value for immediate navigation
            };
        } catch (error) {
            console.error("Error creating audio room:", error);
            return null;
        }
    },
    createLiveVideoRoom: async (host: User, topic: string) => { 
        try {
            const hostAuthor = { id: host.id, name: host.name, avatarUrl: host.avatarUrl, username: host.username };
            const roomData = {
                host: hostAuthor,
                topic,
                participants: [], // Host will be added when they join the screen
                createdAt: serverTimestamp(),
                status: 'live',
            };
            const ref = await addDoc(collection(db, 'liveVideoRooms'), roomData);
             return {
                ...roomData,
                id: ref.id,
                createdAt: new Date().toISOString(),
            };
        } catch(error) {
            console.error("Error creating video room:", error);
            return null;
        }
    },
    getCampaignsForSponsor: async (sponsorId: string): Promise<Campaign[]> => [],
    submitCampaignForApproval: async (campaignData: any, transactionId: string) => {
        const campaignToSave = { ...campaignData, views: 0, clicks: 0, status: 'pending', transactionId };
        await addDoc(collection(db, 'campaigns'), removeUndefined(campaignToSave));
    },
    getRandomActiveCampaign: async (): Promise<Campaign | null> => null,
    trackAdView: async (campaignId: string) => updateDoc(doc(db, 'campaigns', campaignId), { views: increment(1) }),
    trackAdClick: async (campaignId: string) => updateDoc(doc(db, 'campaigns', campaignId), { clicks: increment(1) }),
    submitLead: async (leadData: any) => addDoc(collection(db, 'leads'), { ...leadData, createdAt: serverTimestamp() }),
    getLeadsForCampaign: async (campaignId: string): Promise<Lead[]> => [],
    getStories: async (currentUserId: string): Promise<any[]> => [],
    markStoryAsViewed: async (storyId: string, userId: string) => updateDoc(doc(db, 'stories', storyId), { viewedBy: arrayUnion(userId) }),
    createStory: async (storyData: any, mediaFile: any): Promise<Story> => ({...storyData, id: '', createdAt: new Date().toISOString(), duration: 5, viewedBy: []}),
    async getGroupById(groupId: string): Promise<Group | null> {
        if (!groupId) return null;
        try {
            const groupRef = doc(db, 'groups', groupId);
            const docSnap = await getDoc(groupRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    ...data,
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
                } as Group;
            }
            return null;
        } catch (error) {
            console.error("Error fetching group by ID:", error);
            return null;
        }
    },
    getSuggestedGroups: async (userId: string): Promise<Group[]> => [],
    async createGroup(creator: User, name: string, description: string, coverPhotoUrl: string, privacy: 'public' | 'private', requiresApproval: boolean, category: GroupCategory) {
        try {
            const creatorAuthor = {
                id: creator.id,
                name: creator.name,
                username: creator.username,
                avatarUrl: creator.avatarUrl,
            };
    
            const groupsRef = collection(db, 'groups');
            const newGroupRef = doc(groupsRef);
    
            const newGroupData = {
                name,
                description,
                creator: creatorAuthor,
                coverPhotoUrl,
                members: [creatorAuthor],
                memberIds: [creator.id],
                memberCount: 1,
                admins: [creatorAuthor],
                moderators: [],
                privacy,
                createdAt: serverTimestamp(),
                category,
                requiresApproval,
                joinRequests: [],
                pendingPosts: [],
                invitedUserIds: [],
            };
            
            await setDoc(newGroupRef, newGroupData);

            const creatorRef = doc(db, 'users', creator.id);
            await updateDoc(creatorRef, { groupIds: arrayUnion(newGroupRef.id) });
    
            return {
                id: newGroupRef.id,
                ...newGroupData,
                createdAt: new Date().toISOString()
            };
    
        } catch (error) {
            console.error("Error creating group:", error);
            return null;
        }
    },
    getPostsForGroup: async (groupId: string): Promise<Post[]> => [],
    async updateGroupSettings(groupId: string, settings: Partial<Group>): Promise<boolean> {
        const groupRef = doc(db, 'groups', groupId);
        try {
            const settingsToSave = { ...settings };
            if (settings.coverPhotoUrl && settings.coverPhotoUrl.startsWith('data:image')) {
                const blob = await fetch(settings.coverPhotoUrl).then(res => res.blob());
                const { url: newCoverUrl } = await uploadMediaToCloudinary(blob, `group_cover_${groupId}_${Date.now()}.jpeg`);
                settingsToSave.coverPhotoUrl = newCoverUrl;
            }
    
            await updateDoc(groupRef, removeUndefined(settingsToSave));
            return true;
        } catch (error) {
            console.error("Error updating group settings:", error);
            return false;
        }
    },
    pinPost: async (groupId: string, postId: string): Promise<boolean> => true,
    unpinPost: async (groupId: string): Promise<boolean> => true,
    inviteFriendToGroup: async (groupId: string, friendId: string): Promise<boolean> => true,
    getGroupChat: async (groupId: string): Promise<GroupChat | null> => null,
    sendGroupChatMessage: async (groupId: string, sender: Author, text: string): Promise<GroupChat> => ({ groupId, messages: [] }),
    getGroupEvents: async (groupId: string): Promise<Event[]> => [],
    createGroupEvent: async (creator: User, groupId: string, title: string, description: string, date: string): Promise<Event | null> => null,
    rsvpToEvent: async (userId: string, eventId: string): Promise<boolean> => true,
    adminLogin: async (email: string, password: string): Promise<AdminUser | null> => {
        try {
            const adminsRef = collection(db, 'admins');
            const q = query(adminsRef, where("email", "==", email.toLowerCase()));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                return null; // No admin with this email
            }

            const adminDoc = querySnapshot.docs[0];
            const adminData = adminDoc.data();

            if (adminData.password === password) {
                return { id: adminDoc.id, email: adminData.email };
            }

            return null; // Incorrect password
        } catch (error) {
            console.error("Admin login error:", error);
            return null;
        }
    },
    adminRegister: async (email: string, password: string): Promise<AdminUser | null> => {
        try {
            const adminsRef = collection(db, 'admins');
            const q = query(adminsRef, where("email", "==", email.toLowerCase()));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                return null; // Admin with this email already exists
            }

            const newAdminDocRef = await addDoc(adminsRef, {
                email: email.toLowerCase(),
                password: password, // In a real app, hash this password
                createdAt: serverTimestamp(),
            });

            return { id: newAdminDocRef.id, email: email.toLowerCase() };
        } catch (error) {
            console.error("Admin registration error:", error);
            return null;
        }
    },
    getAdminDashboardStats: async (): Promise<any> => ({ totalUsers: 0, newUsersToday: 0, postsLast24h: 0, pendingCampaigns: 0, activeUsersNow: 0, pendingReports: 0, pendingPayments: 0 }),
    getAllUsersForAdmin: async (): Promise<User[]> => {
        const snapshot = await getDocs(collection(db, 'users'));
        return snapshot.docs.map(docToUser);
    },
    updateUserRole: async (userId: string, newRole: 'admin' | 'user'): Promise<boolean> => true,
    getPendingCampaigns: async (): Promise<Campaign[]> => [],
    approveCampaign: async (campaignId: string) => {
        const campaignRef = doc(db, 'campaigns', campaignId);
        const campaignDoc = await getDoc(campaignRef);
        if (campaignDoc.exists()) {
            await updateDoc(campaignRef, { status: 'active' });
            const campaign = campaignDoc.data();
            const actor = { id: 'admin', name: 'VoiceBook Admin' } as User;
            await _createNotification(campaign.sponsorId, 'campaign_approved', actor, { campaignName: campaign.sponsorName });
        }
    },
    rejectCampaign: async (campaignId: string, reason: string) => {
        const campaignRef = doc(db, 'campaigns', campaignId);
        const campaignDoc = await getDoc(campaignRef);
        if (campaignDoc.exists()) {
            await updateDoc(campaignRef, { status: 'rejected' });
            const campaign = campaignDoc.data();
            const actor = { id: 'admin', name: 'VoiceBook Admin' } as User;
            await _createNotification(campaign.sponsorId, 'campaign_rejected', actor, { campaignName: campaign.sponsorName, rejectionReason: reason });
        }
    },
    getAllPostsForAdmin: async (): Promise<Post[]> => [],
    deletePostAsAdmin: async (postId: string): Promise<boolean> => true,
    deleteCommentAsAdmin: async (commentId: string, postId: string): Promise<boolean> => true,
    getPostById: async (postId: string): Promise<Post | null> => null,
    getPendingReports: async (): Promise<Report[]> => [],
    resolveReport: async (reportId: string, resolution: string) => {},
    banUser: async (userId: string): Promise<boolean> => true,
    unbanUser: async (userId: string): Promise<boolean> => true,
    warnUser: async (userId: string, message: string): Promise<boolean> => {
        const actor = { id: 'admin', name: 'VoiceBook Admin' } as User;
        await _createNotification(userId, 'admin_warning', actor, { message });
        return true;
    },
    suspendUserCommenting: async (userId: string, days: number): Promise<boolean> => true,
    liftUserCommentingSuspension: async (userId: string): Promise<boolean> => true,
    suspendUserPosting: async (userId: string, days: number): Promise<boolean> => true,
    liftUserPostingSuspension: async (userId: string): Promise<boolean> => true,
    getUserDetailsForAdmin: async (userId: string): Promise<any> => null,
    sendSiteWideAnnouncement: async (message: string): Promise<boolean> => true,
    getAllCampaignsForAdmin: async (): Promise<Campaign[]> => [],
    verifyCampaignPayment: async (campaignId: string, adminId: string): Promise<boolean> => true,
    adminUpdateUserProfilePicture: async (userId: string, base64: string): Promise<User | null> => null,
    reactivateUserAsAdmin: async (userId: string): Promise<boolean> => true,
    promoteGroupMember: async (groupId: string, userToPromote: User, newRole: 'Admin' | 'Moderator') => firebaseService.promoteGroupMember(groupId, userToPromote, newRole),
    demoteGroupMember: async (groupId: string, userToDemote: User, oldRole: 'Admin' | 'Moderator') => firebaseService.demoteGroupMember(groupId, userToDemote, oldRole),
    async removeGroupMember(groupId: string, userToRemove: User): Promise<boolean> {
        const groupRef = doc(db, 'groups', groupId);
        const userRef = doc(db, 'users', userToRemove.id);
        const memberObject = { id: userToRemove.id, name: userToRemove.name, username: userToRemove.username, avatarUrl: userToRemove.avatarUrl };
        try {
            await updateDoc(groupRef, {
                members: arrayRemove(memberObject),
                memberIds: arrayRemove(userToRemove.id),
                memberCount: increment(-1),
                admins: arrayRemove(memberObject),
                moderators: arrayRemove(memberObject),
            });
            await updateDoc(userRef, { groupIds: arrayRemove(groupId) });
            return true;
        } catch (error) {
            console.error("Error removing group member:", error);
            return false;
        }
    },
    async approveJoinRequest(groupId: string, userId: string): Promise<void> {
        const groupRef = doc(db, 'groups', groupId);
        const userRef = doc(db, 'users', userId);
        
        await runTransaction(db, async (transaction) => {
            const groupDoc = await transaction.get(groupRef);
            const userDoc = await transaction.get(userRef);
            if (!groupDoc.exists() || !userDoc.exists()) throw "Group or user not found";
    
            const groupData = groupDoc.data() as Group;
            const userData = userDoc.data() as User;
    
            const updatedRequests = (groupData.joinRequests || []).filter(req => req.user.id !== userId);
            const memberObject = { id: userData.id, name: userData.name, username: userData.username, avatarUrl: userData.avatarUrl };
    
            transaction.update(groupRef, {
                joinRequests: updatedRequests,
                members: arrayUnion(memberObject),
                memberIds: arrayUnion(userId),
                memberCount: increment(1)
            });
    
            transaction.update(userRef, { groupIds: arrayUnion(groupId) });
        });
    },
    rejectJoinRequest: async (groupId: string, userId: string): Promise<boolean> => true,
    approvePost: async (postId: string): Promise<boolean> => true,
    rejectPost: async (postId: string): Promise<boolean> => true,
    joinGroup: async (userId: string, groupId: string, answers?: string[]): Promise<boolean> => {
         const groupRef = doc(db, 'groups', groupId);
         const user = await firebaseService.getUserProfileById(userId);
         if (!user) return false;
         const memberObject = { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl };
         const groupDoc = await getDoc(groupRef);
         if (!groupDoc.exists()) return false;
         const group = groupDoc.data() as Group;

         if (group.privacy === 'public') {
             await updateDoc(groupRef, {
                 members: arrayUnion(memberObject),
                 memberIds: arrayUnion(user.id),
                 memberCount: increment(1)
             });
             const userRef = doc(db, 'users', userId);
             await updateDoc(userRef, { groupIds: arrayUnion(groupId) });
         } else {
             const request = { user: memberObject, answers: answers || [] };
             await updateDoc(groupRef, { joinRequests: arrayUnion(request) });
             const admins = group.admins || [group.creator];
             for (const admin of admins) {
                 await _createNotification(admin.id, 'group_join_request', user, { groupId, groupName: group.name });
             }
         }
         return true;
    },
    async getAgoraToken(channelName: string, uid: string | number): Promise<string | null> {
        const TOKEN_SERVER_URL = '/api/proxy';
        try {
            const response = await fetch(`${TOKEN_SERVER_URL}?channelName=${channelName}&uid=${uid}`);
            if (!response.ok) throw new Error(`Token server responded with ${response.status}`);
            const data = await response.json();
            return data.rtcToken;
        } catch (error) {
            console.error("Could not fetch Agora token.", error);
            return null;
        }
    },
    listenToUserGroups(userId: string, callback: (groups: Group[]) => void): () => void {
        let groupsUnsubscribe = () => {};
        const userUnsubscribe = onSnapshot(doc(db, 'users', userId), (userDoc) => {
            groupsUnsubscribe(); // Cleanup previous groups listener
    
            if (userDoc.exists()) {
                const groupIds = userDoc.data().groupIds || [];
                if (groupIds.length > 0) {
                    const q = query(collection(db, 'groups'), where(documentId(), 'in', groupIds));
                    groupsUnsubscribe = onSnapshot(q, (groupsSnapshot) => {
                        const groups = groupsSnapshot.docs.map(d => {
                            const data = d.data();
                            return {
                                id: d.id,
                                ...data,
                                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
                            } as Group;
                        });
                        callback(groups);
                    }, (error) => {
                        console.warn("Could not fetch user's groups by ID list due to permissions.", error.message);
                        callback([]);
                    });
                } else {
                    callback([]); // User is in no groups
                }
            } else {
                callback([]); // User document doesn't exist
            }
        }, (error) => {
            console.warn("Could not fetch user's groups due to permissions or data inconsistency.", error.message);
            callback([]);
        });
    
        // Return a function that unsubscribes from both listeners
        return () => {
            userUnsubscribe();
            groupsUnsubscribe();
        };
    },

    listenToGroup(groupId: string, callback: (group: Group | null) => void): () => void {
        const groupRef = doc(db, 'groups', groupId);
        return onSnapshot(groupRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                callback({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
                } as Group);
            } else {
                callback(null);
            }
        }, (error) => {
            console.error(`Error listening to group ${groupId}:`, error);
            callback(null);
        });
    },

    listenToPostsForGroup(groupId: string, callback: (posts: Post[]) => void): () => void {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, where('groupId', '==', groupId), where('status', '==', 'approved'), orderBy('createdAt', 'desc'));
        return onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(docToPost);
            callback(posts);
        }, (error) => {
            console.error(`Error listening to posts for group ${groupId}:`, error);
            callback([]); // Return empty array on error
        });
    },

    listenToGroupChat(groupId: string, callback: (chat: GroupChat | null) => void): () => void {
        const chatRef = doc(db, 'groupChats', groupId);
        return onSnapshot(chatRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                callback({
                    groupId: doc.id,
                    messages: (data.messages || []).map((msg: any) => ({
                        ...msg,
                        createdAt: msg.createdAt instanceof Timestamp ? msg.createdAt.toDate().toISOString() : msg.createdAt,
                    })),
                } as GroupChat);
            } else {
                console.log(`Group chat for ${groupId} not found, creating it.`);
                setDoc(chatRef, { messages: [] })
                    .then(() => {
                         callback({ groupId, messages: [] });
                    })
                    .catch(err => {
                        console.error("Failed to auto-create group chat:", err);
                        callback(null);
                    });
            }
        }, (error) => {
            console.error(`Error listening to group chat ${groupId}:`, error);
            callback(null);
        });
    },
    
    async reactToGroupChatMessage(groupId: string, messageId: string, userId: string, emoji: string): Promise<void> {
        const chatRef = doc(db, 'groupChats', groupId);
        await runTransaction(db, async (transaction) => {
            const chatDoc = await transaction.get(chatRef);
            if (!chatDoc.exists()) throw "Chat does not exist!";
            const messages = chatDoc.data().messages || [];
            const msgIndex = messages.findIndex((m: any) => m.id === messageId);
            if (msgIndex === -1) throw "Message not found!";
    
            const message = messages[msgIndex];
            const reactions = message.reactions || {};
            const previousReaction = Object.keys(reactions).find(key => reactions[key].includes(userId));
    
            if (previousReaction) {
                reactions[previousReaction] = reactions[previousReaction].filter((id: string) => id !== userId);
            }
    
            if (previousReaction !== emoji) {
                if (!reactions[emoji]) {
                    reactions[emoji] = [];
                }
                reactions[emoji].push(userId);
            }
            
            for (const key in reactions) {
                if (reactions[key].length === 0) {
                    delete reactions[key];
                }
            }
            
            message.reactions = reactions;
            messages[msgIndex] = message;
    
            transaction.update(chatRef, { messages });
        });
    },
};
