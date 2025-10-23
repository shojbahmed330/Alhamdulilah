// @ts-nocheck
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { NLUResponse, NLUCommand, MusicTrack, User, Post, Campaign, FriendshipStatus, Comment, Message, Conversation, ChatSettings, LiveAudioRoom, LiveVideoRoom, Group, Story, Event, GroupChat, JoinRequest, GroupCategory, StoryPrivacy, PollOption, AdminUser, CategorizedExploreFeed, Report, ReplyInfo, Author, Call, LiveAudioRoomMessage, LiveVideoRoomMessage, VideoParticipantState } from '../types';
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
You are a powerful NLU (Natural Language Understanding) engine for VoiceBook, a voice-controlled social media app. Your sole purpose is to analyze a user's raw text command and convert it into a structured JSON format.

Your response MUST be a single, valid JSON object and nothing else.

The JSON object must have:
1. An "intent" field: A string matching one of the intents from the list below.
2. An optional "slots" object: For intents that require extra information (like a name, number, or text).

// --- CRITICAL LANGUAGE & PHRASING RULES ---
Your primary function is to be a robust multilingual interpreter.
- **Languages:** You MUST flawlessly understand English, Bengali (বাংলা), and "Banglish" (e.g., "amar post", "profile dekhao").
- **Synonyms & Phrasing:** Users will use many different phrases for the same action. Be flexible. "like this", "love dao", "react with a heart", "bhalobasha dilam" all map to a 'like' or 'love' reaction. "show me", "open", "dekhao" all map to an 'open' action.
- **Regional Variations:** While you receive text, be aware that it might be a transcription of regional dialects. Interpret the user's likely intent even if the phrasing is not standard. For example, "post ta share koroin" (a dialect version) should be understood as "share this post".

// --- CRITICAL CONTEXT AWARENESS RULES ---
Your most important job is to understand the user's context. The app provides context, such as the 'active_author_name' (the author of the post or owner of the profile currently on screen). You must decide if a command is **contextual** or **targeted**.

1.  **CONTEXTUAL COMMANDS (Default Behavior):**
    A command is **contextual** if it's a general action without an explicit target name. Assume these commands apply to whatever content is currently on the user's screen (e.g., a post, a profile).
    - **Your Output:** For these commands, you MUST include \`"is_contextual": true\` in the slots. You MUST NOT include a 'target_name'.
    - **Applies to:** Any action that can be performed on a piece of content, such as 'like', 'comment', 'share', 'save', 'hide', 'report', 'open', 'add friend', 'send message'.
    - **Examples:**
        - User is viewing a post and says: "like this", "share", "open post", "ei post-e comment koro", "লাইক দাও".
        - User is viewing a profile and says: "send message", "add friend", "block user".
    - **Example JSON Output:**
        - Command: "comment on this photo"
        - Correct: { "intent": "intent_comment", "slots": { "is_contextual": true } }
        - Incorrect: { "intent": "intent_comment", "slots": { "target_name": "Shojib" } } // Do not infer the name from context.

2.  **TARGETED COMMANDS (Explicit Behavior):**
    A command is **targeted** if the user explicitly says a person's name as the target of the action.
    - **Your Output:** For these, you MUST include the extracted name in the \`"target_name"\` slot. You MUST NOT include \`"is_contextual": true\`.
    - **Examples:**
        - "open Prithibi's profile"
        - "like Shojib's post"
        - "send a message to Maria"
    - **Example JSON Output:**
        - Command: "open Prithibi's profile"
        - Correct: { "intent": "intent_open_profile", "slots": { "target_name": "Prithibi" } }
        - Incorrect: { "intent": "intent_open_profile", "slots": { "target_name": "Prithibi", "is_contextual": true } }

3.  **SELF-REFERENTIAL COMMANDS ("My"):**
    If the user refers to themselves ("my profile", "amar post", "আমার প্রোফাইল"), use the base intent without any slots. The app knows who the current user is.
    - **Example JSON Output:**
        - Command: "show my profile"
        - Correct: { "intent": "intent_open_profile" }
        - Incorrect: { "intent": "intent_open_profile", "slots": { "target_name": "my" } }

// --- CHAINED COMMANDS ---
If a user says multiple commands at once, you MUST identify it and return a single JSON object with the intent "intent_chained_command". This object's "slots" MUST contain a "commands" array. Each element in the array is a standard command object with its own "intent" and "slots".
- Example Command: "open Shojib's profile and send him a message saying hello"
- JSON Output:
{
  "intent": "intent_chained_command",
  "slots": {
    "commands": [
      { "intent": "intent_open_profile", "slots": { "target_name": "Shojib" } },
      { "intent": "intent_send_text_message_with_content", "slots": { "message_content": "hello", "is_contextual": true } }
    ]
  }
}
- Example Command: "like this post and then share it"
- JSON Output:
{
  "intent": "intent_chained_command",
  "slots": {
    "commands": [
      { "intent": "intent_react_to_post", "slots": { "reaction_type": "like", "is_contextual": true } },
      { "intent": "intent_share", "slots": { "is_contextual": true } }
    ]
  }
}

// --- DICTATION COMMANDS ---
For long-form text input like writing a post or comment.
- "dictate caption", "start dictation", "voice type koro" -> "intent_dictate_caption"
- "dictate comment" -> "intent_dictate_comment"
- "stop dictation", "shunte thamo" -> "intent_stop_dictation"

// --- BENGALI, BANGLISH & ENGLISH EXAMPLES BY CATEGORY ---
// Navigation
- "amar feed dekhao", "home page e jao", "go to my feed", "প্রথম পাতা" -> "intent_open_feed"
- "explore page", "explore koro", "এক্সপ্লোর" -> "intent_open_explore"
- "shojib er profile dekho", "open Shojib's profile" -> { "intent": "intent_open_profile", "slots": { "target_name": "Shojib" } }
- "messages open koro", "inbox a jao", "মেসেজ" -> "intent_open_messages"
- "back", "phire jao", "আগের পেজে যান" -> "intent_go_back"
- "help", "ki ki command ache", "সাহায্য" -> "intent_help"

// Feed Interaction
- "next post", "porer post", "পরের পোস্টে যাও" -> "intent_next_post"
- "like koro", "like this post" -> { "intent": "intent_react_to_post", "slots": { "reaction_type": "like", "is_contextual": true } }
- "love dao", "bhalobasha" -> { "intent": "intent_react_to_post", "slots": { "reaction_type": "love", "is_contextual": true } }
- "haha react koro", "hashi" -> { "intent": "intent_react_to_post", "slots": { "reaction_type": "haha", "is_contextual": true } }
- "comment on Shojib's post", "shojiber post e comment koro" -> { "intent": "intent_comment", "slots": { "target_name": "Shojib" } }
- "ei post e comment koro eta sundor", "comment on this post this is nice" -> { "intent": "intent_add_comment_text", "slots": { "comment_text": "this is nice", "is_contextual": true } }
- "share koro", "শেয়ার" -> { "intent": "intent_share", "slots": { "is_contextual": true } }
- "save this post", "post ta save koro" -> { "intent": "intent_save_post", "slots": { "is_contextual": true } }

// Content Creation
- "create a new post", "notun post", "নতুন পোস্ট" -> "intent_create_post"
- "start voice post", "voice record koro" -> "intent_create_voice_post"
- "stop recording", "record bondho koro" -> "intent_stop_recording"
- "post it", "post koro" -> "intent_post_confirm"
- "generate an image of a red car", "lal gari'r ekta chobi banao" -> { "intent": "intent_generate_image", "slots": { "prompt": "a red car" } }

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
- intent_open_post_viewer
- intent_create_post
- intent_create_voice_post
- intent_stop_recording
- intent_post_confirm
- intent_re_record
- intent_comment
- intent_add_comment_text (extracts 'comment_text')
- intent_add_comment_to_image (extracts 'comment_text')
- intent_post_comment
- intent_search_user (extracts 'target_name')
- intent_select_result (extracts 'index')
- intent_react_to_post (extracts 'reaction_type')
- intent_share
- intent_save_post
- intent_hide_post
- intent_copy_link
- intent_report_post
- intent_delete_post
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
- intent_chained_command
- intent_dictate_caption
- intent_dictate_comment
- intent_stop_dictation
`;

const nluCommandSchema = {
    type: Type.OBJECT,
    properties: {
        intent: { type: Type.STRING },
        slots: {
            type: Type.OBJECT,
            properties: {
                is_contextual: { type: Type.BOOLEAN },
                target_name: { type: Type.STRING },
                index: { type: Type.STRING },
                field: { type: Type.STRING },
                value: { type: Type.STRING },
                setting: { type: Type.STRING },
                message_content: { type: Type.STRING },
                emoji_type: { type: Type.STRING },
                reaction_type: { type: Type.STRING },
                comment_text: { type: Type.STRING },
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
                theme_name: { type: Type.STRING },
                reply_text: { type: Type.STRING },
                age_range: { type: Type.STRING },
                gender: { type: Type.STRING },
                location: { type: Type.STRING },
                bug_description: { type: Type.STRING },
                feedback_text: { type: Type.STRING },
                nickname: { type: Type.STRING },
                status_text: { type: Type.STRING },
            },
        }
    },
    required: ['intent']
};

export const geminiService = {
  // --- NLU ---
  async processIntent(command, context) {
    
    let dynamicContext = "";
    if (context?.userNames && context.userNames.length > 0) {
        dynamicContext += `
For intents that require a 'target_name' (like open_profile, send_message, add_friend, etc.), the user might say one of these names: [${context.userNames.join(', ')}]. Extract the name exactly as it appears in this list if you find a match.`;
    }
     if (context?.groupNames && context.groupNames.length > 0) {
        dynamicContext += `
For intents related to groups (like join_group, leave_group, etc.), here are some available groups: [${context.groupNames.join(', ')}].`;
    }
     if (context?.themeNames && context.themeNames.length > 0) {
        dynamicContext += `
For 'intent_change_chat_theme', available themes are: [${context.themeNames.join(', ')}].`;
    }
    if (context?.active_author_name) {
        dynamicContext += `
The post currently on screen belongs to '${context.active_author_name}'. Generic commands like "this post" or "like this" refer to them.`;
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
                    ...nluCommandSchema.properties.slots.properties, // all existing slots
                    commands: {
                        type: Type.ARRAY,
                        items: nluCommandSchema
                    }
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
      return parsed;
    } catch (error) {
      console.error("Error processing intent:", error);
      console.error("Failed command:", command);
      return { intent: 'unknown' };
    }
  },

  async correctTranscript(rawText) {
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
      return correctedText.replace(/^"|"$/g, '');
    } catch (error) {
      console.error("Error correcting transcript with Gemini:", error);
      return rawText;
    }
  },

  getFriendRequests: (userId) => firebaseService.getFriendRequests(userId),
  acceptFriendRequest: (currentUserId, requestingUserId) => firebaseService.acceptFriendRequest(currentUserId, requestingUserId),
  declineFriendRequest: (currentUserId, requestingUserId) => firebaseService.declineFriendRequest(currentUserId, requestingUserId),
  checkFriendshipStatus: (currentUserId, profileUserId) => firebaseService.checkFriendshipStatus(currentUserId, profileUserId),
  addFriend: (currentUserId, targetUserId) => firebaseService.addFriend(currentUserId, targetUserId),
  unfriendUser: (currentUserId, targetUserId) => firebaseService.unfriendUser(currentUserId, targetUserId),
  cancelFriendRequest: (currentUserId, targetUserId) => firebaseService.cancelFriendRequest(currentUserId, targetUserId),
  getRecommendedFriends: (userId) => firebaseService.getRecommendedFriends(userId),
  getFriendsList: (userId) => firebaseService.getFriendsList(userId),
  getCommonFriends: (userId1, userId2) => firebaseService.getCommonFriends(userId1, userId2),
  getUserById: (userId) => firebaseService.getUserProfileById(userId),
  getUsersByIds: (userIds) => firebaseService.getUsersByIds(userIds),
  searchUsers: (query) => firebaseService.searchUsers(query),
  updateProfile: (userId, updates) => firebaseService.updateProfile(userId, updates),
  updateProfilePicture: (userId, base64, caption, captionStyle) => firebaseService.updateProfilePicture(userId, base64, caption, captionStyle),
  updateCoverPhoto: (userId, base64, caption, captionStyle) => firebaseService.updateCoverPhoto(userId, base64, caption, captionStyle),
  blockUser: (currentUserId, targetUserId) => firebaseService.blockUser(currentUserId, targetUserId),
  unblockUser: (currentUserId, targetUserId) => firebaseService.unblockUser(currentUserId, targetUserId),
  changePassword: (userId, currentPass, newPass) => firebaseService.changePassword(userId, currentPass, newPass),
  deactivateAccount: (userId) => firebaseService.deactivateAccount(userId),
  updateVoiceCoins: (userId, amount) => firebaseService.updateVoiceCoins(userId, amount),

  async generateImageForPost(prompt) {
      try {
          const hash = prompt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const imageUrl = `https://picsum.photos/seed/${hash}/1024`;
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });
      } catch (error) {
          console.error("Failed to generate placeholder image:", error);
          return null;
      }
  },

  async editImage(base64ImageData, mimeType, prompt) {
    try {
        const imagePart = { inlineData: { data: base64ImageData, mimeType: mimeType } };
        const textPart = { text: prompt };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (error) {
        console.error("Error editing image with Gemini:", error);
        return null;
    }
  },
  
  async getCategorizedExploreFeed(userId) {
    const posts = await firebaseService.getExplorePosts(userId);
    if (posts.length === 0) {
        return { trending: [], forYou: [], recent: [], funnyVoiceNotes: [], newTalent: [] };
    }
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
        return {
            trending: (categorizedIds.trending || []).map((id) => postsById.get(id)).filter(Boolean),
            forYou: (categorizedIds.forYou || []).map((id) => postsById.get(id)).filter(Boolean),
            recent: (categorizedIds.recent || []).map((id) => postsById.get(id)).filter(Boolean),
            funnyVoiceNotes: (categorizedIds.funnyVoiceNotes || []).map((id) => postsById.get(id)).filter(Boolean),
            newTalent: (categorizedIds.newTalent || []).map((id) => postsById.get(id)).filter(Boolean),
        };
    } catch (error) {
        console.error("Error categorizing explore feed with Gemini:", error);
        const sortedByReactions = posts.slice().sort((a, b) => Object.keys(b.reactions || {}).length - Object.keys(a.reactions || {}).length);
        return {
            trending: sortedByReactions.slice(0, 10),
            forYou: posts.slice(0, 10).sort(() => 0.5 - Math.random()), // Shuffle
            recent: posts.slice(0, 10),
            funnyVoiceNotes: posts.filter(p => p.audioUrl && p.caption?.toLowerCase().match(/funny|lol|haha|😂/)).slice(0, 10),
            newTalent: sortedByReactions.slice(10, 20),
        };
    }
  },
  getMusicLibrary: () => MOCK_MUSIC_LIBRARY,
  listenToFeedPosts: (currentUserId, friendIds, blockedUserIds, callback) => firebaseService.listenToFeedPosts(currentUserId, friendIds, blockedUserIds, callback),
  listenToReelsPosts: (userId, callback) => firebaseService.listenToReelsPosts(userId, callback),
  getPostsByIds: (postIds) => firebaseService.getPostsByIds(postIds),
  savePost: (userId, postId) => firebaseService.savePost(userId, postId),
  unsavePost: (userId, postId) => firebaseService.unsavePost(userId, postId),
  ensureChatDocumentExists: (user1, user2) => firebaseService.ensureChatDocumentExists(user1, user2),
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
  listenToChatSettings: (chatId, callback) => firebaseService.listenToChatSettings(chatId, callback),
  updateTypingStatus: (chatId, userId, isTyping) => firebaseService.updateTypingStatus(chatId, userId, isTyping),

  createReplySnippet(message) {
        let content = '';
        if (message.isDeleted) {
            content = "Unsent message";
        } else {
            switch(message.type) {
                case 'text': content = message.text || ''; break;
                case 'image': content = 'Image'; break;
                case 'video': content = 'Video'; break;
                case 'audio': content = `Voice Message · ${message.duration}s`; break;
                default: content = '';
            }
        }
        return { messageId: message.id, senderName: message.senderId, content };
    },
    listenToLiveAudioRooms: (callback) => firebaseService.listenToLiveAudioRooms(callback),
    listenToLiveVideoRooms: (callback) => firebaseService.listenToLiveVideoRooms(callback),
    listenToAudioRoom: (roomId, callback) => firebaseService.listenToRoom(roomId, 'audio', callback),
    listenToVideoRoom: (roomId, callback) => firebaseService.listenToRoom(roomId, 'video', callback),
    createLiveAudioRoom: (host, topic) => firebaseService.createLiveAudioRoom(host, topic),
    createLiveVideoRoom: (host, topic) => firebaseService.createLiveVideoRoom(host, topic),
    joinLiveAudioRoom: (userId, roomId) => firebaseService.joinLiveAudioRoom(userId, roomId),
    joinLiveVideoRoom: (userId, roomId) => firebaseService.joinLiveVideoRoom(userId, roomId),
    leaveLiveAudioRoom: (userId, roomId) => firebaseService.leaveLiveAudioRoom(userId, roomId),
    leaveLiveVideoRoom: (userId, roomId) => firebaseService.leaveLiveVideoRoom(userId, roomId),
    endLiveAudioRoom: (userId, roomId) => firebaseService.endLiveAudioRoom(userId, roomId),
    endLiveVideoRoom: (userId, roomId) => firebaseService.endLiveVideoRoom(userId, roomId),
    getAudioRoomDetails: (roomId) => firebaseService.getAudioRoomDetails(roomId),
    getRoomDetails: (roomId, type) => firebaseService.getRoomDetails(roomId, type),
    raiseHandInAudioRoom: (userId, roomId) => firebaseService.raiseHandInAudioRoom(userId, roomId),
    inviteToSpeakInAudioRoom: (hostId, userId, roomId) => firebaseService.inviteToSpeakInAudioRoom(hostId, userId, roomId),
    moveToAudienceInAudioRoom: (hostId, userId, roomId) => firebaseService.moveToAudienceInAudioRoom(hostId, userId, roomId),
    listenToLiveAudioRoomMessages: (roomId, callback) => firebaseService.listenToLiveAudioRoomMessages(roomId, callback),
    sendLiveAudioRoomMessage: (roomId, sender, text, isHost, isSpeaker) => firebaseService.sendLiveAudioRoomMessage(roomId, sender, text, isHost, isSpeaker),
    reactToLiveAudioRoomMessage: (roomId, messageId, userId, emoji) => firebaseService.reactToLiveAudioRoomMessage(roomId, messageId, userId, emoji),
    listenToLiveVideoRoomMessages: (roomId, callback) => firebaseService.listenToLiveVideoRoomMessages(roomId, callback),
    sendLiveVideoRoomMessage: (roomId, sender, text) => firebaseService.sendLiveVideoRoomMessage(roomId, sender, text),
    updateParticipantStateInVideoRoom: (roomId, userId, updates) => firebaseService.updateParticipantStateInVideoRoom(roomId, userId, updates),
    createCall: (caller, callee, chatId, type) => firebaseService.createCall(caller, callee, chatId, type),
    listenToCall: (callId, callback) => firebaseService.listenToCall(callId, callback),
    listenForIncomingCalls: (userId, callback) => firebaseService.listenForIncomingCalls(userId, callback),
    updateCallStatus: (callId, status) => firebaseService.updateCallStatus(callId, status),
    getAgoraToken: (channelName, uid) => firebaseService.getAgoraToken(channelName, uid),
    getCampaignsForSponsor: (sponsorId) => firebaseService.getCampaignsForSponsor(sponsorId),
    submitCampaignForApproval: (campaignData, transactionId) => firebaseService.submitCampaignForApproval(campaignData, transactionId),
    getRandomActiveCampaign: () => firebaseService.getRandomActiveCampaign(),
    trackAdView: (campaignId) => firebaseService.trackAdView(campaignId),
    trackAdClick: (campaignId) => firebaseService.trackAdClick(campaignId),
    submitLead: (leadData) => firebaseService.submitLead(leadData),
    getLeadsForCampaign: (campaignId) => firebaseService.getLeadsForCampaign(campaignId),
    getInjectableAd: (currentUser) => firebaseService.getInjectableAd(currentUser),
    getInjectableStoryAd: (currentUser) => firebaseService.getInjectableStoryAd(currentUser),
    getStories: (currentUserId) => firebaseService.getStories(currentUserId),
    markStoryAsViewed: (storyId, userId) => firebaseService.markStoryAsViewed(storyId, userId),
    createStory: (storyData, mediaFile) => firebaseService.createStory(storyData, mediaFile),
    createStoryFromPost: (user, post) => firebaseService.createStoryFromPost(user, post),
    listenToUserGroups: (userId, callback) => firebaseService.listenToUserGroups(userId, callback),
    listenToGroup: (groupId, callback) => firebaseService.listenToGroup(groupId, callback),
    getGroupById: (groupId) => firebaseService.getGroupById(groupId),
    getSuggestedGroups: (userId) => firebaseService.getSuggestedGroups(userId),
    createGroup: (creator, name, description, coverPhotoUrl, privacy, requiresApproval, category) => firebaseService.createGroup(creator, name, description, coverPhotoUrl, privacy, requiresApproval, category),
    joinGroup: (userId, groupId, answers) => firebaseService.joinGroup(userId, groupId, answers),
    leaveGroup: (userId, groupId) => firebaseService.leaveGroup(userId, groupId),
    getPostsForGroup: (groupId) => firebaseService.getPostsForGroup(groupId),
    listenToPostsForGroup: (groupId, callback) => firebaseService.listenToPostsForGroup(groupId, callback),
    updateGroupSettings: (groupId, settings) => firebaseService.updateGroupSettings(groupId, settings),
    pinPost: (groupId, postId) => firebaseService.pinPost(groupId, postId),
    unpinPost: (groupId) => firebaseService.unpinPost(groupId),
    voteOnPoll: (userId, postId, optionIndex) => firebaseService.voteOnPoll(userId, postId, optionIndex),
    markBestAnswer: (userId, postId, commentId) => firebaseService.markBestAnswer(userId, postId, commentId),
    inviteFriendToGroup: (groupId, friendId) => firebaseService.inviteFriendToGroup(groupId, friendId),
    listenToGroupChat: (groupId, callback) => firebaseService.listenToGroupChat(groupId, callback),
    getGroupChat: (groupId) => firebaseService.getGroupChat(groupId),
    sendGroupChatMessage: (groupId, sender, text) => firebaseService.sendGroupChatMessage(groupId, sender, text),
    reactToGroupChatMessage: (groupId, messageId, userId, emoji) => firebaseService.reactToGroupChatMessage(groupId, messageId, userId, emoji),
    getGroupEvents: (groupId) => firebaseService.getGroupEvents(groupId),
    createGroupEvent: (creator, groupId, title, description, date) => firebaseService.createGroupEvent(creator, groupId, title, description, date),
    rsvpToEvent: (userId, eventId) => firebaseService.rsvpToEvent(userId, eventId),
    adminLogin: (email, password) => firebaseService.adminLogin(email, password),
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
    createReport: (reporter, content, contentType, reason) => firebaseService.createReport(reporter, content, contentType, reason),
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
    promoteGroupMember: (groupId, userToPromote, newRole) => firebaseService.promoteGroupMember(groupId, userToPromote, newRole),
    demoteGroupMember: (groupId, userToDemote, oldRole) => firebaseService.demoteGroupMember(groupId, userToDemote, oldRole),
    removeGroupMember: (groupId, userToRemove) => firebaseService.removeGroupMember(groupId, userToRemove),
    approveJoinRequest: (groupId, userId) => firebaseService.approveJoinRequest(groupId, userId),
    rejectJoinRequest: (groupId, userId) => firebaseService.rejectJoinRequest(groupId, userId),
    approvePost: (postId) => firebaseService.approvePost(postId),
    rejectPost: (postId) => firebaseService.rejectPost(postId),
};
