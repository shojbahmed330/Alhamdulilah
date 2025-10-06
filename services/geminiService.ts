// @ts-nocheck
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { NLUResponse, MusicTrack, User, Post, Campaign, FriendshipStatus, Comment, Message, Conversation, ChatSettings, LiveAudioRoom, LiveVideoRoom, Group, Story, Event, GroupChat, JoinRequest, GroupCategory, StoryPrivacy, PollOption, AdminUser, CategorizedExploreFeed, Report, ReplyInfo, Author, Call, LiveAudioRoomMessage, LiveVideoRoomMessage, VideoParticipantState } from '../types';
import { VOICE_EMOJI_MAP, MOCK_MUSIC_LIBRARY, DEFAULT_AVATARS, DEFAULT_COVER_PHOTOS } from '../constants';
import { firebaseService } from './firebaseService';


// --- Gemini API Initialization ---
const apiKey = process.env.API_KEY;
if (!apiKey) {
    alert("CRITICAL ERROR: Gemini API key is not configured. Please ensure your environment variables are set up correctly.");
    throw new Error("API_KEY not configured. Please set it in your environment.");
}
const ai = new GoogleGenAI({ apiKey });

const NLU_SYSTEM_INSTRUCTION_BASE = `
You are a powerful NLU (Natural Language Understanding) engine for VoiceBook, a voice-controlled social media app. Your sole purpose is to analyze a user's raw text command and convert it into a structured JSON format. You must understand both English and Bengali (Bangla), including "Banglish" (Bengali words typed with English characters).

Your response MUST be a single, valid JSON object and nothing else.

The JSON object must have:
1. An "intent" field: A string matching one of the intents from the list below.
2. An optional "slots" object: For intents that require extra information (like a name or number).

CONTEXTUAL RULES:
- If a user says a simple action like "like", "comment", "share", "save post", "hide post", "copy link", "report post" or "open profile" without specifying a target name, assume they mean the currently active post on the screen. The app will handle the context. Your job is just to return the base intent (e.g., "intent_like").
- If the user says "my profile", "amar profile", or similar, the intent MUST be 'intent_open_profile' and there MUST NOT be a 'target_name' slot.
- If a command is "next" or "previous", it could mean the next post in a feed, or the next image in a multi-image view. The app has context. You can use 'intent_next_post' for generic next commands, and 'intent_next_image' if the user explicitly says 'next image' or 'porer chobi'.

BENGALI & BANGLISH EXAMPLES:
Your primary goal is to map various phrasings to the correct intent. Be flexible with synonyms and phrasings.
- "home page e jao", "amar feed dekhao", "news feed", "প্রথম পাতা" -> "intent_open_feed"
- "like koro", "bhalo legeche", "লাইক" -> "intent_like"
- "comment koro", "montobbo koro", "একটা মন্তব্য কর" -> "intent_comment"
- "share koro", "শেয়ার" -> "intent_share"
- "post koro", "kichu likho", "নতুন পোস্ট" -> "intent_create_post"
- "amar bondhuder list dekhao", "friends list", "আমার বন্ধু" -> "intent_open_friends_page"
- "message dekhao", "inbox a jao", "মেসেজ" -> "intent_open_messages"
- "explore page", "explore koro", "এক্সপ্লোর" -> "intent_open_explore"
- "scroll koro", "niche jao" -> "intent_scroll_down"
- "upore jao" -> "intent_scroll_up"
- "thamo", "stop scroll" -> "intent_stop_scroll"
- "help", "ki ki command ache", "সাহায্য" -> "intent_help"
- "amar profile" -> "intent_open_profile" (NO target_name)
- "shojib er profile dekho" -> { "intent": "intent_open_profile", "slots": { "target_name": "shojib" } }
- "save this post", "post ta save koro" -> "intent_save_post"
- "hide this", "eta lukao" -> "intent_hide_post"
- "copy link", "link ta copy koro" -> "intent_copy_link"
- "report this post" -> "intent_report_post"
- "create a group named Family", "Family name ekta group kholo" -> { "intent": "intent_create_group", "slots": { "group_name": "Family" } }
- "open groups", "group gulo dekhao" -> "intent_open_groups_hub"
- "create a story", "story banao" -> "intent_create_story"
- "add music", "gaan add koro" -> "intent_add_music"
- "post story", "story ta post koro" -> "intent_post_story"
- "পাসওয়ার্ড পরিবর্তন কর" (change password) -> { "intent": "intent_change_password" }
- "আমার অ্যাকাউন্ট নিষ্ক্রিয় কর" (deactivate my account) -> { "intent": "intent_deactivate_account" }
- "সেটিংসে যাও" (go to settings) -> { "intent": "intent_open_settings" }
- "রুমে যাও" (go to rooms) -> { "intent": "intent_open_rooms_hub" }
- "shojib ke khojo" (search for shojib) -> { "intent": "intent_search_user", "slots": { "target_name": "shojib" } }

If the user's intent is unclear or not in the list, you MUST use the intent "unknown".
`;

let NLU_INTENT_LIST = `
- intent_signup
- intent_login
- intent_play_post
- intent_pause_post
- intent_next_post
- intent_previous_post
- intent_next_image
- intent_previous_image
- intent_create_post
- intent_create_voice_post
- intent_stop_recording
- intent_post_confirm
- intent_re_record
- intent_comment
- intent_post_comment
- intent_search_user (extracts 'target_name')
- intent_select_result (extracts 'index')
- intent_like (extracts 'target_name')
- intent_share
- intent_save_post
- intent_hide_post
- intent_copy_link
- intent_report_post
- intent_open_profile (extracts 'target_name')
- intent_change_avatar
- intent_help
- intent_go_back
- intent_open_settings
- intent_add_friend (extracts 'target_name')
- intent_unfriend_user (extracts 'target_name')
- intent_cancel_friend_request (extracts 'target_name')
- intent_send_message (extracts 'target_name')
- intent_save_settings
- intent_update_profile (extracts 'field', 'value')
- intent_update_privacy (extracts 'setting', 'value')
- intent_update_notification_setting (extracts 'setting', 'value')
- intent_block_user (extracts 'target_name')
- intent_unblock_user (extracts 'target_name')
- intent_edit_profile
- intent_record_message
- intent_send_chat_message
- intent_view_comments (extracts 'target_name')
- intent_send_text_message_with_content (extracts 'message_content')
- intent_open_friend_requests
- intent_accept_request (extracts 'target_name')
- intent_decline_request (extracts 'target_name')
- intent_scroll_up
- intent_scroll_down
- intent_stop_scroll
- intent_open_messages
- intent_open_friends_page
- intent_open_chat (extracts 'target_name')
- intent_change_chat_theme (extracts 'theme_name')
- intent_delete_chat
- intent_send_voice_emoji (extracts 'emoji_type')
- intent_play_comment_by_author (extracts 'target_name')
- intent_view_comments_by_author (extracts 'target_name')
- intent_generate_image (extracts 'prompt')
- intent_clear_image
- intent_claim_reward
- intent_open_ads_center
- intent_create_campaign
- intent_view_campaign_dashboard
- intent_set_sponsor_name (extracts 'sponsor_name')
- intent_set_campaign_caption (extracts 'caption_text')
- intent_set_campaign_budget (extracts 'budget_amount')
- intent_set_media_type (extracts 'media_type')
- intent_launch_campaign
- intent_change_password
- intent_deactivate_account
- intent_open_feed
- intent_open_explore
- intent_open_reels
- intent_open_rooms_hub
- intent_open_audio_rooms
- intent_open_video_rooms
- intent_create_room
- intent_close_room
- intent_reload_page
- intent_open_groups_hub
- intent_join_group (extracts 'group_name')
- intent_leave_group (extracts 'group_name')
- intent_create_group (extracts 'group_name')
- intent_search_group (extracts 'search_query')
- intent_filter_groups_by_category (extracts 'category_name')
- intent_view_group_suggestions
- intent_pin_post
- intent_unpin_post
- intent_open_group_chat
- intent_open_group_events
- intent_create_event
- intent_create_poll
- intent_vote_poll (extracts 'option_number' or 'option_text')
- intent_view_group_by_name (extracts 'group_name')
- intent_manage_group
- intent_open_group_invite_page
- intent_create_story
- intent_add_music
- intent_post_story
- intent_set_story_privacy (extracts 'privacy_level')
- intent_add_text_to_story (extracts 'text')
- intent_react_to_message (extracts 'emoji_type')
- intent_reply_to_message
- intent_reply_to_last_message (extracts 'message_content')
- intent_react_to_last_message (extracts 'emoji_type')
- intent_unsend_message
- intent_send_announcement (extracts 'message_content')
`;

// Define a schema for the Post object to be returned by Gemini
const postSchemaProperties = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING },
        author: {
            type: Type.OBJECT,
            properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                username: { type: Type.STRING },
                avatarUrl: { type: Type.STRING },
            }
        },
        caption: { type: Type.STRING },
        createdAt: { type: Type.STRING },
        reactionCount: { type: Type.NUMBER },
        commentCount: { type: Type.NUMBER },
        imageUrl: { type: Type.STRING },
        videoUrl: { type: Type.STRING },
        audioUrl: { type: Type.STRING },
        postType: { type: Type.STRING },
        isSponsored: { type: Type.BOOLEAN },
    }
};

export const geminiService = {
  // --- NLU ---
  async processIntent(command: string, context?: { userNames?: string[], groupNames?: string[], themeNames?: string[] }): Promise<NLUResponse> {
    
    let dynamicContext = "";
    if (context?.userNames && context.userNames.length > 0) {
        dynamicContext += `\nFor intents that require a 'target_name' (like open_profile, send_message, add_friend, like, block_user, etc.), the user might say one of these names: [${context.userNames.join(', ')}]. Extract the name exactly as it appears in this list if you find a match.`;
    }
     if (context?.groupNames && context.groupNames.length > 0) {
        dynamicContext += `\nFor intents related to groups (like join_group, leave_group, etc.), here are some available groups: [${context.groupNames.join(', ')}].`;
    }
     if (context?.themeNames && context.themeNames.length > 0) {
        dynamicContext += `\nFor 'intent_change_chat_theme', available themes are: [${context.themeNames.join(', ')}].`;
    }

    const systemInstruction = NLU_SYSTEM_INSTRUCTION_BASE + "\nAvailable Intents:\n" + NLU_INTENT_LIST + dynamicContext;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `User command: "${command}"`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING },
              slots: {
                type: Type.OBJECT,
                properties: {
                    target_name: { type: Type.STRING },
                    index: { type: Type.STRING },
                    field: { type: Type.STRING },
                    value: { type: Type.STRING },
                    setting: { type: Type.STRING },
                    message_content: { type: Type.STRING },
                    emoji_type: { type: Type.STRING },
                    prompt: { type: Type.STRING },
                    sponsor_name: { type: Type.STRING },
                    caption_text: { type: Type.STRING },
                    budget_amount: { type: Type.STRING },
                    media_type: { type: Type.STRING },
                    group_name: { type: Type.STRING },
                    search_query: { type: Type.STRING },
                    category_name: { type: Type.STRING },
                    option_number: { type: Type.STRING },
                    option_text: { type: Type.STRING },
                    privacy_level: { type: Type.STRING },
                    text: { type: Type.STRING },
                },
              }
            },
            required: ['intent']
          },
          thinkingConfig: { thinkingBudget: 0 }
        },
      });

      const jsonString = response.text.trim();
      const parsed = JSON.parse(jsonString);
      console.log("NLU Response:", parsed);
      return parsed as NLUResponse;
    } catch (error) {
      console.error("Error processing intent:", error);
      console.error("Failed command:", command);
      return { intent: 'unknown' };
    }
  },

  async correctTranscript(rawText: string): Promise<string> {
    const systemInstruction = `You are an expert transcriber and translator. Your primary task is to correct a raw voice-to-text transcript into proper Bengali (Bangla) script. The input text might be in 'Banglish' (Bengali words spelled phonetically with English letters), a mix of English and Bengali words, or contain speech recognition errors.

Your rules are:
1.  Your output MUST be ONLY the corrected Bengali text. Do not add any explanation, preamble, or markdown.
2.  If the input is primarily English, return it as is, but correct any obvious spelling mistakes.
3.  Preserve proper nouns (like names of people or places) and common English technical terms (like 'Facebook', 'profile', 'post') as they are, using English letters.
4.  Focus on converting phonetic Banglish into the correct Bengali script.

Examples:
- Input: "amar profile dekhao" -> Output: "amar profile দেখাও"
- Input: "shojib khan er new post ta dekhi" -> Output: "Shojib Khan er new post টা দেখি"
- Input: "create a new post" -> Output: "create a new post"
- Input: "explore page a jao" -> Output: "explore page এ যাও"
- Input: "settings change koro" -> Output: "settings change কর"
- Input: "home page" -> Output: "home page"
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Correct the following transcript: "${rawText}"`,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.1, // Be precise
        },
      });

      const correctedText = response.text.trim();
      // Sometimes Gemini might still wrap it in quotes
      return correctedText.replace(/^"|"$/g, '');
    } catch (error) {
      console.error("Error correcting transcript with Gemini:", error);
      // Fallback to the original text if AI fails
      return rawText;
    }
  },

  // --- Friends ---
  getFriendRequests: (userId: string): Promise<User[]> => firebaseService.getFriendRequests(userId),
  acceptFriendRequest: (currentUserId: string, requestingUserId: string) => firebaseService.acceptFriendRequest(currentUserId, requestingUserId),
  declineFriendRequest: (currentUserId: string, requestingUserId: string) => firebaseService.declineFriendRequest(currentUserId, requestingUserId),
  checkFriendshipStatus: (currentUserId: string, profileUserId: string): Promise<FriendshipStatus> => firebaseService.checkFriendshipStatus(currentUserId, profileUserId),
  addFriend: (currentUserId: string, targetUserId: string): Promise<{ success: boolean; reason?: string }> => firebaseService.addFriend(currentUserId, targetUserId),
  unfriendUser: (currentUserId: string, targetUserId: string) => firebaseService.unfriendUser(currentUserId, targetUserId),
  cancelFriendRequest: (currentUserId: string, targetUserId: string) => firebaseService.cancelFriendRequest(currentUserId, targetUserId),

  // --- This is a mock/simulated function ---
  async getRecommendedFriends(userId: string): Promise<User[]> {
      const allUsers = await firebaseService.getAllUsersForAdmin();
      const currentUser = allUsers.find(u => u.id === userId);
      if (!currentUser) return [];

      const friendsAndRequests = new Set([
          ...currentUser.friendIds || [],
          userId
      ]);

      return allUsers.filter(u => !friendsAndRequests.has(u.id));
  },
  
   async getFriendsList(userId: string): Promise<User[]> {
      const user = await firebaseService.getUserProfileById(userId);
      if (!user || !user.friendIds || user.friendIds.length === 0) {
          return [];
      }
      return await firebaseService.getUsersByIds(user.friendIds);
  },
  
  getCommonFriends: (userId1: string, userId2: string): Promise<User[]> => firebaseService.getCommonFriends(userId1, userId2),
  
  // --- Profile & Security ---
  async getUserById(userId: string): Promise<User | null> {
    return firebaseService.getUserProfileById(userId);
  },
  
  async searchUsers(query: string): Promise<User[]> {
    return firebaseService.searchUsers(query);
  },

  async updateProfile(userId: string, updates: Partial<User>): Promise<void> {
    await firebaseService.updateProfile(userId, updates);
  },
  
  async updateProfilePicture(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
    return firebaseService.updateProfilePicture(userId, base64, caption, captionStyle);
  },
  
  async updateCoverPhoto(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
    return firebaseService.updateCoverPhoto(userId, base64, caption, captionStyle);
  },

  async blockUser(currentUserId: string, targetUserId: string): Promise<boolean> {
      return firebaseService.blockUser(currentUserId, targetUserId);
  },
  
  async unblockUser(currentUserId: string, targetUserId: string): Promise<boolean> {
      return firebaseService.unblockUser(currentUserId, targetUserId);
  },

  async changePassword(userId: string, currentPass: string, newPass: string): Promise<boolean> {
      // This is a mock for demonstration. Real password changes need secure backend logic.
      const user = await firebaseService.getUserProfileById(userId);
      if (user && user.password === currentPass) {
          await firebaseService.updateProfile(userId, { password: newPass });
          return true;
      }
      return false;
  },

  async deactivateAccount(userId: string): Promise<boolean> {
      return firebaseService.deactivateAccount(userId);
  },
  
  // --- Voice Coins ---
  async updateVoiceCoins(userId: string, amount: number): Promise<boolean> {
    return firebaseService.updateVoiceCoins(userId, amount);
  },

  // --- Image Generation ---
  async generateImageForPost(prompt: string): Promise<string | null> {
      // This is a mock function as image generation is a premium feature.
      // In a real app, this would call the Gemini Image API.
      // We will return a placeholder image from an external service.
      try {
          // A simple hash to get a different image for different prompts
          const hash = prompt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const imageUrl = `https://picsum.photos/seed/${hash}/1024`;
          // We need to fetch and convert to base64 to simulate the behavior of the real API returning image bytes.
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });
      } catch (error) {
          console.error("Failed to generate placeholder image:", error);
          return null;
      }
  },

  async editImage(base64ImageData: string, mimeType: string, prompt: string): Promise<string | null> {
    try {
        const imagePart = {
            inlineData: {
                data: base64ImageData,
                mimeType: mimeType,
            },
        };
        const textPart = {
            text: prompt,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                // Return a data URL for easy display
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null; // No image found in response
    } catch (error) {
        console.error("Error editing image with Gemini:", error);
        return null;
    }
  },
  
// FIX: Added missing 'getCategorizedExploreFeed' function.
async getCategorizedExploreFeed(userId: string): Promise<CategorizedExploreFeed> {
    // This is a new function to fulfill what ExploreScreen expects.
    // It fetches public posts and uses Gemini to sort them into categories.
    const posts = await firebaseService.getExplorePosts(userId);

    if (posts.length === 0) {
        return { trending: [], forYou: [], recent: [], funnyVoiceNotes: [], newTalent: [] };
    }

    // To save tokens and for efficiency, we send a simplified version of posts to the AI.
    const simplifiedPosts = posts.map(p => ({
        id: p.id,
        caption: p.caption,
        type: p.audioUrl ? 'audio' : (p.videoUrl ? 'video' : 'image/text'),
        reactionCount: Object.keys(p.reactions || {}).length,
        commentCount: p.commentCount || 0,
        createdAt: p.createdAt,
    }));

    const systemInstruction = `You are a social media content curator for VoiceBook. Your task is to categorize a list of posts into predefined categories based on the provided JSON data. The user ID of the person browsing is ${userId}.
    
    Categories are:
    - trending: Posts with high engagement (reactionCount, commentCount) that are very recent.
    - forYou: Posts personalized for the user. Since you don't have user history, base this on a variety of interesting, high-quality content that is likely to be engaging. Create a good mix of content types.
    - recent: The most recently created posts, based on the 'createdAt' field.
    - funnyVoiceNotes: Audio posts ('type': 'audio') where the caption suggests humor.
    - newTalent: Posts from users who might be new or have less content but are showing promise. You don't have user data, so just pick some interesting posts that are not already top trending.

    You will receive a JSON array of simplified post objects. You MUST return a single, valid JSON object with keys corresponding to the categories. Each key's value should be an array of post IDs (strings) belonging to that category. A post can appear in multiple categories. Ensure you return some posts in each category if possible, but don't force it if none fit. Prioritize 'trending' and 'forYou' to be well-populated. Limit each category to a maximum of 10 post IDs.
    `;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            trending: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of post IDs for trending content." },
            forYou: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of post IDs for personalized content." },
            recent: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of post IDs for recent content." },
            funnyVoiceNotes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of post IDs for funny voice notes." },
            newTalent: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of post IDs for new talent." },
        },
        required: ["trending", "forYou", "recent", "funnyVoiceNotes", "newTalent"]
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: JSON.stringify(simplifiedPosts),
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const jsonString = response.text.trim();
        const categorizedIds = JSON.parse(jsonString);

        const postsById = new Map(posts.map(p => [p.id, p]));
        
        const result: CategorizedExploreFeed = {
            trending: (categorizedIds.trending || []).map((id: string) => postsById.get(id)).filter(Boolean),
            forYou: (categorizedIds.forYou || []).map((id: string) => postsById.get(id)).filter(Boolean),
            recent: (categorizedIds.recent || []).map((id: string) => postsById.get(id)).filter(Boolean),
            funnyVoiceNotes: (categorizedIds.funnyVoiceNotes || []).map((id: string) => postsById.get(id)).filter(Boolean),
            newTalent: (categorizedIds.newTalent || []).map((id: string) => postsById.get(id)).filter(Boolean),
        };
        return result;

    } catch (error) {
        console.error("Error categorizing explore feed with Gemini:", error);
        // Fallback to simple local categorization if AI fails
        const sortedByReactions = posts.slice().sort((a, b) => Object.keys(b.reactions || {}).length - Object.keys(a.reactions || {}).length);
        return {
            trending: sortedByReactions.slice(0, 10),
            forYou: posts.slice(0, 10).sort(() => 0.5 - Math.random()), // Shuffle
            recent: posts.slice(0, 10), // Assumes posts are already sorted by date desc
            funnyVoiceNotes: posts.filter(p => p.audioUrl && p.caption?.toLowerCase().match(/funny|lol|haha|😂/)).slice(0, 10),
            newTalent: sortedByReactions.slice(10, 20), // Grab some that aren't top trending
        };
    }
  },

  // Music Library (Mock)
  getMusicLibrary(): MusicTrack[] {
      return MOCK_MUSIC_LIBRARY;
  },

  // --- Mocks & Simulations ---
  
  async sendAudioPost(userId: string, duration: number, caption: string): Promise<Post> {
    const user = await firebaseService.getUserProfileById(userId);
    if (!user) throw new Error("User not found for creating post");
    
    const newPost: Post = {
        id: `mock_${Date.now()}`,
        author: { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
        audioUrl: '#', // Mock URL
        caption: caption,
        duration: duration,
        createdAt: new Date().toISOString(),
        commentCount: 0,
        comments: [],
        reactions: {},
    };

    await firebaseService.createPost(newPost, {});
    return newPost;
  },
  
  // --- Posts ---
  listenToFeedPosts: (currentUserId: string, friendIds: string[], blockedUserIds: string[], callback: (posts: Post[]) => void) => {
      return firebaseService.listenToFeedPosts(currentUserId, friendIds, blockedUserIds, callback);
  },
  getPostsByIds: (postIds: string[]): Promise<Post[]> => firebaseService.getPostsByIds(postIds),
  savePost: (userId: string, postId: string): Promise<boolean> => firebaseService.savePost(userId, postId),
  unsavePost: (userId: string, postId: string): Promise<boolean> => firebaseService.unsavePost(userId, postId),

  getChatId: (user1Id, user2Id) => firebaseService.getChatId(user1Id, user2Id),
  listenToMessages: (chatId, callback) => firebaseService.listenToMessages(chatId, callback),
  listenToConversations: (userId, callback) => firebaseService.listenToConversations(userId, callback),
  sendMessage: (chatId, sender, recipient, messageContent) => firebaseService.sendMessage(chatId, sender, recipient, messageContent),
  unsendMessage: (chatId, messageId, userId) => firebaseService.unsendMessage(chatId, messageId, userId),
  reactToMessage: (chatId, messageId, userId, emoji) => firebaseService.reactToMessage(chatId, messageId, userId, emoji),
  deleteChatHistory: (chatId) => firebaseService.deleteChatHistory(chatId),
  getChatSettings: (chatId) => firebaseService.getChatSettings(chatId),
  updateChatSettings: (chatId, settings) => firebaseService.updateChatSettings(chatId, settings),
  markMessagesAsRead: (chatId, userId) => firebaseService.markMessagesAsRead(chatId, userId),

    createReplySnippet(message: Message): ReplyInfo {
        let content = '';
        if (message.isDeleted) {
            content = "Unsent message";
        } else {
            switch(message.type) {
                case 'text': content = message.text || ''; break;
                case 'image': content = 'Image'; break;
                case 'video': content = 'Video'; break;
                case 'audio': content = `Voice Message · ${message.duration}s`; break;
            }
        }
        return {
            messageId: message.id,
            senderName: message.senderId,
            content: content
        };
    },

    // --- Rooms ---
    listenToLiveAudioRooms: (callback: (rooms: LiveAudioRoom[]) => void) => firebaseService.listenToLiveAudioRooms(callback),
    listenToLiveVideoRooms: (callback: (rooms: LiveVideoRoom[]) => void) => firebaseService.listenToLiveVideoRooms(callback),
    listenToAudioRoom: (roomId: string, callback: (room: LiveAudioRoom | null) => void) => firebaseService.listenToRoom(roomId, 'audio', callback),
    listenToVideoRoom: (roomId: string, callback: (room: LiveVideoRoom | null) => void) => firebaseService.listenToRoom(roomId, 'video', callback),
    createLiveAudioRoom: (host: User, topic: string) => firebaseService.createLiveAudioRoom(host, topic),
    createLiveVideoRoom: (host: User, topic: string) => firebaseService.createLiveVideoRoom(host, topic),
    joinLiveAudioRoom: (userId: string, roomId: string) => firebaseService.joinLiveAudioRoom(userId, roomId),
    joinLiveVideoRoom: (userId: string, roomId: string) => firebaseService.joinLiveVideoRoom(userId, roomId),
    leaveLiveAudioRoom: (userId: string, roomId: string) => firebaseService.leaveLiveAudioRoom(userId, roomId),
    leaveLiveVideoRoom: (userId: string, roomId: string) => firebaseService.leaveLiveVideoRoom(userId, roomId),
    endLiveAudioRoom: (userId: string, roomId: string) => firebaseService.endLiveAudioRoom(userId, roomId),
    endLiveVideoRoom: (userId: string, roomId: string) => firebaseService.endLiveVideoRoom(userId, roomId),
    getAudioRoomDetails: (roomId: string) => firebaseService.getAudioRoomDetails(roomId),
    getRoomDetails: (roomId: string, type: 'audio' | 'video') => firebaseService.getRoomDetails(roomId, type),
    raiseHandInAudioRoom: (userId: string, roomId: string) => firebaseService.raiseHandInAudioRoom(userId, roomId),
    inviteToSpeakInAudioRoom: (hostId: string, userId: string, roomId: string) => firebaseService.inviteToSpeakInAudioRoom(hostId, userId, roomId),
    moveToAudienceInAudioRoom: (hostId: string, userId: string, roomId: string) => firebaseService.moveToAudienceInAudioRoom(hostId, userId, roomId),
    listenToLiveAudioRoomMessages: (roomId: string, callback: (messages: LiveAudioRoomMessage[]) => void) => firebaseService.listenToLiveAudioRoomMessages(roomId, callback),
    sendLiveAudioRoomMessage: (roomId: string, sender: User, text: string, isHost: boolean, isSpeaker: boolean) => firebaseService.sendLiveAudioRoomMessage(roomId, sender, text, isHost, isSpeaker),
    reactToLiveAudioRoomMessage: (roomId: string, messageId: string, userId: string, emoji: string) => firebaseService.reactToLiveAudioRoomMessage(roomId, messageId, userId, emoji),
    listenToLiveVideoRoomMessages: (roomId: string, callback: (messages: LiveVideoRoomMessage[]) => void) => firebaseService.listenToLiveVideoRoomMessages(roomId, callback),
    sendLiveVideoRoomMessage: (roomId: string, sender: User, text: string) => firebaseService.sendLiveVideoRoomMessage(roomId, sender, text),
    updateParticipantStateInVideoRoom: (roomId: string, userId: string, updates: Partial<VideoParticipantState>) => firebaseService.updateParticipantStateInVideoRoom(roomId, userId, updates),
    
    // --- Ads & Campaigns ---
    getCampaignsForSponsor: (sponsorId: string) => firebaseService.getCampaignsForSponsor(sponsorId),
    submitCampaignForApproval: (campaignData: Omit<Campaign, 'id'|'views'|'clicks'|'status'|'transactionId'>, transactionId: string) => firebaseService.submitCampaignForApproval(campaignData, transactionId),
    getRandomActiveCampaign: () => firebaseService.getRandomActiveCampaign(),
    trackAdView: (campaignId: string) => firebaseService.trackAdView(campaignId),
    trackAdClick: (campaignId: string) => firebaseService.trackAdClick(campaignId),
    submitLead: (leadData: Omit<Lead, 'id'>) => firebaseService.submitLead(leadData),
    getLeadsForCampaign: (campaignId: string) => firebaseService.getLeadsForCampaign(campaignId),
    getInjectableAd: (currentUser: User) => firebaseService.getInjectableAd(currentUser),
    getInjectableStoryAd: (currentUser: User) => firebaseService.getInjectableStoryAd(currentUser),

    // --- Stories ---
    getStories: (currentUserId: string) => firebaseService.getStories(currentUserId),
    markStoryAsViewed: (storyId: string, userId: string) => firebaseService.markStoryAsViewed(storyId, userId),
    createStory: (storyData, mediaFile) => firebaseService.createStory(storyData, mediaFile),
    
    // --- Groups ---
    listenToUserGroups: (userId: string, callback: (groups: Group[]) => void) => firebaseService.listenToUserGroups(userId, callback),
    listenToGroup: (groupId: string, callback: (group: Group | null) => void) => firebaseService.listenToGroup(groupId, callback),
    getGroupById: (groupId: string) => firebaseService.getGroupById(groupId),
    getSuggestedGroups: (userId: string) => firebaseService.getSuggestedGroups(userId),
    createGroup: (creator, name, description, coverPhotoUrl, privacy, requiresApproval, category) => firebaseService.createGroup(creator, name, description, coverPhotoUrl, privacy, requiresApproval, category),
    joinGroup: (userId, groupId, answers) => firebaseService.joinGroup(userId, groupId, answers),
    leaveGroup: (userId, groupId) => firebaseService.leaveGroup(userId, groupId),
    getPostsForGroup: (groupId) => firebaseService.getPostsForGroup(groupId),
    listenToPostsForGroup: (groupId: string, callback: (posts: Post[]) => void) => firebaseService.listenToPostsForGroup(groupId, callback),
    updateGroupSettings: (groupId, settings) => firebaseService.updateGroupSettings(groupId, settings),
    pinPost: (groupId, postId) => firebaseService.pinPost(groupId, postId),
    unpinPost: (groupId) => firebaseService.unpinPost(groupId),
    voteOnPoll: (userId, postId, optionIndex) => firebaseService.voteOnPoll(userId, postId, optionIndex),
    markBestAnswer: (userId, postId, commentId) => firebaseService.markBestAnswer(userId, postId, commentId),
    inviteFriendToGroup: (groupId, friendId) => firebaseService.inviteFriendToGroup(groupId, friendId),
    
    // --- Group Chat & Events ---
    listenToGroupChat: (groupId: string, callback: (chat: GroupChat | null) => void) => firebaseService.listenToGroupChat(groupId, callback),
    getGroupChat: (groupId: string) => firebaseService.getGroupChat(groupId),
    sendGroupChatMessage: (groupId, sender, text) => firebaseService.sendGroupChatMessage(groupId, sender, text),
    reactToGroupChatMessage: (groupId: string, messageId: string, userId: string, emoji: string) => firebaseService.reactToGroupChatMessage(groupId, messageId, userId, emoji),
    getGroupEvents: (groupId: string) => firebaseService.getGroupEvents(groupId),
    createGroupEvent: (creator, groupId, title, description, date) => firebaseService.createGroupEvent(creator, groupId, title, description, date),
    rsvpToEvent: (userId, eventId) => firebaseService.rsvpToEvent(userId, eventId),
    
    // --- Admin Panel ---
    adminLogin: (email, password) => firebaseService.adminLogin(email, password),
    adminRegister: (email, password) => firebaseService.adminRegister(email, password),
    getAdminDashboardStats: () => firebaseService.getAdminDashboardStats(),
    getAllUsersForAdmin: () => firebaseService.getAllUsersForAdmin(),
    updateUserRole: (userId, newRole) => firebaseService.updateUserRole(userId, newRole),
    getPendingCampaigns: () => firebaseService.getPendingCampaigns(),
    approveCampaign: (campaignId) => firebaseService.approveCampaign(campaignId),
    rejectCampaign: (campaignId, reason) => firebaseService.rejectCampaign(campaignId, reason),
    getAllPostsForAdmin: () => firebaseService.getAllPostsForAdmin(),
    deletePostAsAdmin: (postId) => firebaseService.deletePostAsAdmin(postId),
    deleteCommentAsAdmin: (commentId, postId) => firebaseService.deleteCommentAsAdmin(commentId, postId),
    getPostById: (postId) => firebaseService.getPostById(postId),
    getPendingReports: () => firebaseService.getPendingReports(),
    resolveReport: (reportId, resolution) => firebaseService.resolveReport(reportId, resolution),
    createReport: (reporter: User, content: Post | Comment | User, contentType: 'post' | 'comment' | 'user', reason: string) => firebaseService.createReport(reporter, content, contentType, reason),
    banUser: (userId) => firebaseService.banUser(userId),
    unbanUser: (userId) => firebaseService.unbanUser(userId),
    warnUser: (userId, message) => firebaseService.warnUser(userId, message),
    suspendUserCommenting: (userId, days) => firebaseService.suspendUserCommenting(userId, days),
    liftUserCommentingSuspension: (userId) => firebaseService.liftUserCommentingSuspension(userId),
    suspendUserPosting: (userId, days) => firebaseService.suspendUserPosting(userId, days),
    liftUserPostingSuspension: (userId) => firebaseService.liftUserPostingSuspension(userId),
    getUserDetailsForAdmin: (userId) => firebaseService.getUserDetailsForAdmin(userId),
    sendSiteWideAnnouncement: (message) => firebaseService.sendSiteWideAnnouncement(message),
    getAllCampaignsForAdmin: () => firebaseService.getAllCampaignsForAdmin(),
    verifyCampaignPayment: (campaignId, adminId) => firebaseService.verifyCampaignPayment(campaignId, adminId),
    adminUpdateUserProfilePicture: (userId, base64) => firebaseService.adminUpdateUserProfilePicture(userId, base64),
    reactivateUserAsAdmin: (userId) => firebaseService.reactivateUserAsAdmin(userId),
    promoteGroupMember: (groupId: string, userToPromote: User, newRole: 'Admin' | 'Moderator') => firebaseService.promoteGroupMember(groupId, userToPromote, newRole),
    demoteGroupMember: (groupId: string, userToDemote: User, oldRole: 'Admin' | 'Moderator') => firebaseService.demoteGroupMember(groupId, userToDemote, oldRole),
    removeGroupMember: (groupId: string, userToRemove: User) => firebaseService.removeGroupMember(groupId, userToRemove),
    approveJoinRequest: (groupId: string, userId: string) => firebaseService.approveJoinRequest(groupId, userId),
    rejectJoinRequest: (groupId: string, userId: string) => firebaseService.rejectJoinRequest(groupId, userId),
    approvePost: (postId: string) => firebaseService.approvePost(postId),
    rejectPost: (postId: string) => firebaseService.rejectPost(postId),
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