
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Post, User, ScrollState, Campaign, AppView, Story, Comment } from '../types';
import { PostCard } from './PostCard';
import CreatePostWidget from './CreatePostWidget';
import SkeletonPostCard from './SkeletonPostCard';
import { geminiService } from '../services/geminiService';
import RewardedAdWidget from './RewardedAdWidget';
import { getTtsPrompt, VOICE_EMOJI_MAP } from '../constants';
import StoriesTray from './StoriesTray';
import { firebaseService } from '../services/firebaseService';
import { useSettings } from '../contexts/SettingsContext';

const localCommandMap: { [key: string]: { intent: string; slots?: any } } = {
  // --- Navigation ---
  'go to my feed': { intent: 'intent_open_feed' },
  'open feed': { intent: 'intent_open_feed' },
  'show my feed': { intent: 'intent_open_feed' },
  'home page e jao': { intent: 'intent_open_feed' },
  'amar feed dekhao': { intent: 'intent_open_feed' },
  'news feed': { intent: 'intent_open_feed' },
  'প্রথম পাতা': { intent: 'intent_open_feed' },

  'open explore': { intent: 'intent_open_explore' },
  'explore page': { intent: 'intent_open_explore' },
  'explore koro': { intent: 'intent_open_explore' },
  'এক্সপ্লোর': { intent: 'intent_open_explore' },
  
  'open reels': { intent: 'intent_open_reels' },
  'show reels': { intent: 'intent_open_reels' },
  'reels dekhao': { intent: 'intent_open_reels' },
  'রিলস দেখাও': { intent: 'intent_open_reels' },

  'show my profile': { intent: 'intent_open_profile' },
  'open my profile': { intent: 'intent_open_profile' },
  'amar profile': { intent: 'intent_open_profile' },
  'আমার প্রোফাইল': { intent: 'intent_open_profile' },

  'open messages': { intent: 'intent_open_messages' },
  'show messages': { intent: 'intent_open_messages' },
  'message dekhao': { intent: 'intent_open_messages' },
  'inbox e jao': { intent: 'intent_open_messages' },
  'মেসেজ দেখাও': { intent: 'intent_open_messages' },
  
  'open groups': { intent: 'intent_open_groups_hub' },
  'show groups': { intent: 'intent_open_groups_hub' },
  'group page': { intent: 'intent_open_groups_hub' },
  'গ্রুপ পেজ': { intent: 'intent_open_groups_hub' },

  'open rooms': { intent: 'intent_open_rooms_hub' },
  'show rooms': { intent: 'intent_open_rooms_hub' },
  'room page': { intent: 'intent_open_rooms_hub' },
  'রুম পেজ': { intent: 'intent_open_rooms_hub' },
  
  'show my saved posts': { intent: 'intent_open_profile', slots: { initialTab: 'saved' } },
  'amar saved post': { intent: 'intent_open_profile', slots: { initialTab: 'saved' } },
  'সেভ করা পোস্ট': { intent: 'intent_open_profile', slots: { initialTab: 'saved' } },

  'go back': { intent: 'intent_go_back' },
  'back': { intent: 'intent_go_back' },
  'phire jao': { intent: 'intent_go_back' },
  'ফিরে যাও': { intent: 'intent_go_back' },
  'আগের পেজে যান': { intent: 'intent_go_back' },

  'reload page': { intent: 'intent_reload_page' },
  'reload': { intent: 'intent_reload_page' },
  'refresh': { intent: 'intent_reload_page' },
  'reload koro': { intent: 'intent_reload_page' },
  'রিলোড কর': { intent: 'intent_reload_page' },

  // --- Feed Interaction ---
  'play post': { intent: 'intent_play_post', slots: { is_contextual: true } },
  'play': { intent: 'intent_play_post', slots: { is_contextual: true } },
  'play koro': { intent: 'intent_play_post', slots: { is_contextual: true } },
  'প্লে কর': { intent: 'intent_play_post', slots: { is_contextual: true } },
  
  'pause post': { intent: 'intent_pause_post', slots: { is_contextual: true } },
  'pause': { intent: 'intent_pause_post', slots: { is_contextual: true } },
  'pause koro': { intent: 'intent_pause_post', slots: { is_contextual: true } },
  'পজ কর': { intent: 'intent_pause_post', slots: { is_contextual: true } },

  'next post': { intent: 'intent_next_post' },
  'next': { intent: 'intent_next_post' },
  'porer post': { intent: 'intent_next_post' },
  'পরের পোস্টে যাও': { intent: 'intent_next_post' },
  
  'previous post': { intent: 'intent_previous_post' },
  'previous': { intent: 'intent_previous_post' },
  'ager post': { intent: 'intent_previous_post' },
  'আগের পোস্টে যাও': { intent: 'intent_previous_post' },

  'scroll down': { intent: 'intent_scroll_down' },
  'niche jao': { intent: 'intent_scroll_down' },
  'scroll up': { intent: 'intent_scroll_up' },
  'upore jao': { intent: 'intent_scroll_up' },
  'stop scroll': { intent: 'intent_stop_scroll' },
  'thamo': { intent: 'intent_stop_scroll' },

  'like': { intent: 'intent_react_to_post', slots: { reaction_type: 'like', is_contextual: true } },
  'like this': { intent: 'intent_react_to_post', slots: { reaction_type: 'like', is_contextual: true } },
  'like this post': { intent: 'intent_react_to_post', slots: { reaction_type: 'like', is_contextual: true } },
  'like koro': { intent: 'intent_react_to_post', slots: { reaction_type: 'like', is_contextual: true } },
  'love': { intent: 'intent_react_to_post', slots: { reaction_type: 'love', is_contextual: true } },
  'love this': { intent: 'intent_react_to_post', slots: { reaction_type: 'love', is_contextual: true } },
  'love dao': { intent: 'intent_react_to_post', slots: { reaction_type: 'love', is_contextual: true } },
  'bhalobasha dilam': { intent: 'intent_react_to_post', slots: { reaction_type: 'love', is_contextual: true } },
  'haha': { intent: 'intent_react_to_post', slots: { reaction_type: 'haha', is_contextual: true } },
  'hashi': { intent: 'intent_react_to_post', slots: { reaction_type: 'haha', is_contextual: true } },
  'sad': { intent: 'intent_react_to_post', slots: { reaction_type: 'sad', is_contextual: true } },
  'kanna': { intent: 'intent_react_to_post', slots: { reaction_type: 'sad', is_contextual: true } },
  'wow': { intent: 'intent_react_to_post', slots: { reaction_type: 'wow', is_contextual: true } },
  'angry': { intent: 'intent_react_to_post', slots: { reaction_type: 'angry', is_contextual: true } },
  'raag': { intent: 'intent_react_to_post', slots: { reaction_type: 'angry', is_contextual: true } },
  
  'open comments': { intent: 'intent_view_comments', slots: { is_contextual: true } },
  'view comments': { intent: 'intent_view_comments', slots: { is_contextual: true } },
  'comment dekhao': { intent: 'intent_view_comments', slots: { is_contextual: true } },
  'কমেন্টগুলো দেখাও': { intent: 'intent_view_comments', slots: { is_contextual: true } },
  
  'open this post': { intent: 'intent_open_post_viewer', slots: { is_contextual: true } },
  'post ta kholo': { intent: 'intent_open_post_viewer', slots: { is_contextual: true } },
  'পোস্ট-টি খোল': { intent: 'intent_open_post_viewer', slots: { is_contextual: true } },
  
  'share this post': { intent: 'intent_share', slots: { is_contextual: true } },
  'share': { intent: 'intent_share', slots: { is_contextual: true } },
  'share koro': { intent: 'intent_share', slots: { is_contextual: true } },
  'শেয়ার কর': { intent: 'intent_share', slots: { is_contextual: true } },
  
  'save this post': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'save' } },
  'save': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'save' } },
  'post save koro': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'save' } },
  'পোস্ট সেভ কর': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'save' } },
  
  'unsave this post': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'unsave' } },
  'unsave': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'unsave' } },
  'post unsave koro': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'unsave' } },
  'আনসেভ কর': { intent: 'intent_save_post', slots: { is_contextual: true, action: 'unsave' } },
  
  'hide this post': { intent: 'intent_hide_post', slots: { is_contextual: true } },
  'hide post': { intent: 'intent_hide_post', slots: { is_contextual: true } },
  'post lukao': { intent: 'intent_hide_post', slots: { is_contextual: true } },
  'পোস্ট লুকাও': { intent: 'intent_hide_post', slots: { is_contextual: true } },
  
  'copy link': { intent: 'intent_copy_link', slots: { is_contextual: true } },
  'link copy koro': { intent: 'intent_copy_link', slots: { is_contextual: true } },
  'লিঙ্ক কপি কর': { intent: 'intent_copy_link', slots: { is_contextual: true } },
  
  'report post': { intent: 'intent_report_post', slots: { is_contextual: true } },
  'report this post': { intent: 'intent_report_post', slots: { is_contextual: true } },
  'report koro': { intent: 'intent_report_post', slots: { is_contextual: true } },
  'রিপোর্ট কর': { intent: 'intent_report_post', slots: { is_contextual: true } },
  
  'delete this post': { intent: 'intent_delete_post', slots: { is_contextual: true } },
  'delete post': { intent: 'intent_delete_post', slots: { is_contextual: true } },
  'post delete koro': { intent: 'intent_delete_post', slots: { is_contextual: true } },
  'পোস্ট ডিলিট কর': { intent: 'intent_delete_post', slots: { is_contextual: true } },
  
  // --- Content Creation ---
  'create a new post': { intent: 'intent_create_post' },
  'create post': { intent: 'intent_create_post' },
  'notun post': { intent: 'intent_create_post' },
  'নতুন পোস্ট': { intent: 'intent_create_post' },

  'start a voice post': { intent: 'intent_create_voice_post' },
  'create voice post': { intent: 'intent_create_voice_post' },
  'voice post': { intent: 'intent_create_voice_post' },
  'ভয়েস পোস্ট': { intent: 'intent_create_voice_post' },

  'create a poll': { intent: 'intent_create_poll' },
  'create poll': { intent: 'intent_create_poll' },
  
  // --- Friends & Social ---
  'show my friends': { intent: 'intent_open_friends_page' },
  'amar bondhuder dekhao': { intent: 'intent_open_friends_page' },
  'আমার বন্ধুদের দেখাও': { intent: 'intent_open_friends_page' },
  'show friend requests': { intent: 'intent_open_friends_page', slots: { initialTab: 'requests' } },
  
  // --- Settings ---
  'open settings': { intent: 'intent_open_settings' },
  'settings e jao': { intent: 'intent_open_settings' },
  'সেটিংসে যাও': { intent: 'intent_open_settings' },
  'save settings': { intent: 'intent_save_settings' },
};

const commandPatterns: { regex: RegExp; handler: (matches: RegExpMatchArray) => { intent: string; slots?: any } }[] = [
    { regex: /^(?:open|show|dekhao)\s+(.+?)(?:'s| er)?\s+profile$/i, handler: (matches) => ({ intent: 'intent_open_profile', slots: { target_name: matches[1].trim() } }) },
    { regex: /^(?:search for|search|khojo)\s+(.+)$/i, handler: (matches) => ({ intent: 'intent_search_user', slots: { target_name: matches[1].trim() } }) },
    { regex: /^(?:comment on this post|comment|comment koro)\s+(.+)$/i, handler: (matches) => ({ intent: 'intent_add_comment_text', slots: { comment_text: matches[1].trim(), is_contextual: true } }) },
    { regex: /^(?:generate an image of|generate image|image of|chobi banao)\s+(.+)$/i, handler: (matches) => ({ intent: 'intent_generate_image', slots: { prompt: matches[1].trim() } }) },
    { regex: /^(like|love|haha|wow|sad|angry)\s+(.+?)(?:'s)?\s+post$/i, handler: (matches) => ({ intent: 'intent_react_to_post', slots: { reaction_type: matches[1].toLowerCase(), target_name: matches[2].trim() } }) },
    { regex: /^(?:open chat with|start chat with|chat with)\s+(.+)$/i, handler: (matches) => ({ intent: 'intent_open_chat', slots: { target_name: matches[1].trim() } }) },
    { regex: /^(?:add|friend)\s+(.+?)(?:\s+as friend)?$/i, handler: (matches) => ({ intent: 'intent_add_friend', slots: { target_name: matches[1].trim() } }) },
];

interface FeedScreenProps {
  isLoading: boolean;
  posts: Post[];
  currentUser: User;
  onSetTtsMessage: (message: string) => void;
  lastCommand: string | null;
  onOpenProfile: (userName: string) => void;
  onOpenComments: (post: Post, commentToReplyTo?: Comment, initialText?: string) => void;
  onReactToPost: (postId: string, emoji: string) => void;
  onStartCreatePost: (props?: any) => void;
  onRewardedAdClick: (campaign: Campaign) => void;
  onAdViewed: (campaignId: string) => void;
  onAdClick: (post: Post) => void;
  onSharePost: (post: Post) => void;
  onShareAsStory: (post: Post) => void;
  onOpenPhotoViewer: (post: Post, initialUrl?: string) => void;
  onDeletePost: (postId: string) => void;
  onReportPost: (post: Post) => void;
  
  onCommandProcessed: () => void;
  scrollState: ScrollState;
  onSetScrollState: (state: ScrollState) => void;
  onNavigate: (view: AppView, props?: any) => void;
  friends: User[];
  setSearchResults: (results: User[]) => void;
  hiddenPostIds: Set<string>;
  onHidePost: (postId: string) => void;
  onSavePost: (post: Post, isSaving: boolean) => void;
  onCopyLink: (post: Post) => void;
}

const FeedScreen: React.FC<FeedScreenProps> = ({
    isLoading, posts: initialPosts, currentUser, onSetTtsMessage, lastCommand, onOpenProfile,
    onOpenComments, onReactToPost, onStartCreatePost, onRewardedAdClick, onAdViewed,
    onAdClick, onCommandProcessed, scrollState, onSetScrollState, onNavigate, friends, setSearchResults,
    onSharePost, onShareAsStory, onOpenPhotoViewer, onDeletePost, onReportPost, hiddenPostIds, onHidePost, onSavePost, onCopyLink
}) => {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [adInjected, setAdInjected] = useState(false);
  const [currentPostIndex, setCurrentPostIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rewardedCampaign, setRewardedCampaign] = useState<Campaign | null>(null);
  const [storiesByAuthor, setStoriesByAuthor] = useState<Awaited<ReturnType<typeof geminiService.getStories>>>([]);
  
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { language } = useSettings();
  
  const isInitialLoad = useRef(true);
  const isProgrammaticScroll = useRef(false);
  const currentPostIndexRef = useRef(currentPostIndex);
  currentPostIndexRef.current = currentPostIndex;

  const visiblePosts = useMemo(() => {
    return posts.filter(p => p && !hiddenPostIds.has(p.id));
  }, [posts, hiddenPostIds]);

  useEffect(() => {
    setPosts(initialPosts);
    setAdInjected(false); // Reset ad injection when initial posts change
  }, [initialPosts]);

  const fetchRewardedCampaign = useCallback(async () => {
      const camp = await geminiService.getRandomActiveCampaign();
      setRewardedCampaign(camp);
  }, []);
  
  const fetchStories = useCallback(async () => {
      const realStories = await geminiService.getStories(currentUser.id);
      // FIX: Changed to geminiService for consistency
      const adStory = await geminiService.getInjectableStoryAd(currentUser);
  
      if (adStory) {
          const adStoryGroup = {
              author: adStory.author,
              stories: [adStory],
              allViewed: false, // Doesn't apply to ads
          };
          // Inject the ad story at the second position
          const combinedStories = [...realStories];
          combinedStories.splice(1, 0, adStoryGroup);
          setStoriesByAuthor(combinedStories);
      } else {
          setStoriesByAuthor(realStories);
      }
  }, [currentUser]);

  useEffect(() => {
    if (!isLoading && posts.length > 0 && isInitialLoad.current) {
      onSetTtsMessage(getTtsPrompt('feed_loaded', language));
    }
  }, [posts.length, isLoading, onSetTtsMessage, language]);
  
  useEffect(() => {
    if (!isLoading) {
        fetchRewardedCampaign();
        fetchStories();
    }
  }, [isLoading, fetchRewardedCampaign, fetchStories]);

  useEffect(() => {
    const injectAd = async () => {
        if (!isLoading && !adInjected && posts.length > 2) {
            setAdInjected(true);
            // FIX: Changed to geminiService for consistency
            const adPost = await geminiService.getInjectableAd(currentUser);
            if (adPost) {
                const newPosts = [...posts];
                const injectionIndex = 3; 
                newPosts.splice(injectionIndex, 0, adPost);
                setPosts(newPosts);
            }
        }
    };
    injectAd();
  }, [isLoading, posts, adInjected, currentUser]);

  useEffect(() => {
    const scrollContainer = feedContainerRef.current;
    if (!scrollContainer || scrollState === ScrollState.NONE) {
        return;
    }

    let animationFrameId: number;

    const animateScroll = () => {
        if (scrollState === ScrollState.DOWN) {
            scrollContainer.scrollTop += 2;
        } else if (scrollState === ScrollState.UP) {
            scrollContainer.scrollTop -= 2;
        }
        animationFrameId = requestAnimationFrame(animateScroll);
    };

    animationFrameId = requestAnimationFrame(animateScroll);

    return () => {
        cancelAnimationFrame(animationFrameId);
    };
  }, [scrollState]);
  
  const handleCommand = useCallback(async (command: string) => {
    try {
        const lowerCommand = command.toLowerCase().trim();
        let intentResponse;

        // Step 1: Check exact match in the local map
        const localIntent = localCommandMap[lowerCommand];
        if (localIntent) {
            console.log("Processing command locally (map):", localIntent);
            intentResponse = localIntent;
        } else {
            // Step 2: Check regex patterns for commands with parameters
            for (const pattern of commandPatterns) {
                const match = lowerCommand.match(pattern.regex);
                if (match) {
                    console.log("Processing command locally (regex):", pattern.regex);
                    intentResponse = pattern.handler(match);
                    break; // Stop on first match
                }
            }
        }

        // Step 3: Fallback to Gemini AI if no local match found
        if (!intentResponse) {
            const activePost = currentPostIndex >= 0 ? visiblePosts[currentPostIndex] : null;
            const activeAuthorName = activePost && !activePost.isSponsored ? activePost.author.name : undefined;
    
            const userNamesOnScreen = posts.map(p => p.isSponsored ? p.sponsorName as string : p.author.name);
            const allContextNames = [...userNamesOnScreen, ...friends.map(f => f.name)];
            
            console.log("Falling back to AI for command:", command);
            intentResponse = await geminiService.processIntent(command, { 
                userNames: [...new Set(allContextNames)],
                active_author_name: activeAuthorName,
            });
        }
        
        const { intent, slots } = intentResponse;
        const activePost = currentPostIndex >= 0 ? visiblePosts[currentPostIndex] : null;

        const getTargetPost = (): Post | null => {
            if (slots?.is_contextual && activePost) {
                return activePost;
            }

            if (slots?.target_name) {
                const targetName = (slots.target_name as string).toLowerCase();
                const targetPost = visiblePosts.find(p => !p.isSponsored && p.author.name.toLowerCase().includes(targetName));
                if (targetPost) return targetPost;
                
                onSetTtsMessage(`Couldn't find a post by ${slots.target_name} on your screen.`);
                return null;
            }
            
            if (activePost) return activePost;
            
            onSetTtsMessage("Sorry, I couldn't figure out which post you meant. Please scroll to a post first.");
            return null;
        };
        
        const postTargetIntents = [
            'intent_react_to_post', 'intent_share', 'intent_save_post', 'intent_hide_post', 'intent_delete_post',
            'intent_copy_link', 'intent_report_post', 'intent_add_comment_text',
            'intent_open_post_viewer', 'intent_comment', 'intent_view_comments'
        ];

        if (postTargetIntents.includes(intent)) {
            const targetPost = getTargetPost();
            if (targetPost) {
                switch (intent) {
                    case 'intent_react_to_post':
                        const reactionKey = (slots?.reaction_type as string)?.toLowerCase() || 'like';
                        const emoji = VOICE_EMOJI_MAP[reactionKey] || '👍';
                        onReactToPost(targetPost.id, emoji);
                        onSetTtsMessage(`Reacted with ${emoji} to ${targetPost.author.name}'s post.`);
                        break;
                    case 'intent_share':
                        onSharePost(targetPost);
                        break;
                    case 'intent_save_post':
                        const isSaving = slots?.action !== 'unsave';
                        onSavePost(targetPost, isSaving);
                        break;
                    case 'intent_hide_post':
                        onHidePost(targetPost.id);
                        break;
                    case 'intent_delete_post':
                        if (targetPost.author.id === currentUser.id) {
                            onDeletePost(targetPost.id);
                        } else {
                            onSetTtsMessage("You can only delete your own posts.");
                        }
                        break;
                    case 'intent_copy_link':
                        onCopyLink(targetPost);
                        break;
                    case 'intent_report_post':
                        onReportPost(targetPost);
                        break;
                    case 'intent_open_post_viewer':
                        onOpenPhotoViewer(targetPost);
                        break;
                    case 'intent_add_comment_text':
                    case 'intent_comment':
                    case 'intent_view_comments':
                        const commentText = slots?.comment_text as string | undefined;
                        onOpenComments(targetPost, undefined, commentText);
                        if (commentText) {
                            onSetTtsMessage(`Adding comment "${commentText}". You can say 'post comment' to publish.`);
                        }
                        break;
                }
            }
            onCommandProcessed();
            return;
        }

        switch (intent) {
          case 'intent_next_post':
            isProgrammaticScroll.current = true;
            setCurrentPostIndex(prev => (prev < 0 ? 0 : (prev + 1) % visiblePosts.length));
            setIsPlaying(true);
            break;
          case 'intent_previous_post':
            isProgrammaticScroll.current = true;
            setCurrentPostIndex(prev => (prev > 0 ? prev - 1 : visiblePosts.length - 1));
            setIsPlaying(true);
            break;
          case 'intent_play_post':
            if (currentPostIndex < 0 && visiblePosts.length > 0) {
                isProgrammaticScroll.current = true;
                setCurrentPostIndex(0);
            }
            setIsPlaying(true);
            break;
          case 'intent_pause_post':
            setIsPlaying(false);
            break;
          case 'intent_open_profile':
            if (slots?.target_name) {
              onSetTtsMessage(`Opening profile for ${slots.target_name as string}.`);
              onOpenProfile(slots.target_name as string);
            } else {
              onSetTtsMessage("Opening your profile.");
              onNavigate(AppView.PROFILE, { username: currentUser.username, initialTab: slots?.initialTab });
            }
            break;
          case 'intent_create_post':
              onStartCreatePost();
              break;
          case 'intent_create_voice_post':
              onStartCreatePost({ startRecording: true });
              break;
          case 'intent_create_poll':
              onStartCreatePost({ createPoll: true });
              break;
          case 'intent_generate_image':
              onStartCreatePost({ imagePrompt: slots?.prompt as string });
              break;
          case 'intent_open_feed':
              onNavigate(AppView.FEED);
              break;
          case 'intent_open_explore':
              onNavigate(AppView.EXPLORE);
              onSetTtsMessage("Opening Explore.");
              break;
          case 'intent_open_reels':
              onNavigate(AppView.REELS);
              onSetTtsMessage("Opening Reels.");
              break;
          case 'intent_open_ads_center':
              onNavigate(AppView.ADS_CENTER);
              break;
          case 'intent_open_friends_page':
              onNavigate(AppView.FRIENDS, { initialTab: slots?.initialTab });
              break;
          case 'intent_open_messages':
              onNavigate(AppView.CONVERSATIONS);
              break;
          case 'intent_open_settings':
              onNavigate(AppView.SETTINGS);
              break;
          case 'intent_open_rooms_hub':
              onNavigate(AppView.ROOMS_HUB);
              break;
          case 'intent_open_audio_rooms':
              onNavigate(AppView.ROOMS_LIST);
              break;
          case 'intent_open_video_rooms':
              onNavigate(AppView.VIDEO_ROOMS_LIST);
              break;
          case 'intent_reload_page':
              onSetTtsMessage("Reloading your feed...");
              fetchRewardedCampaign();
              break;
          case 'intent_search_user':
            if (slots?.target_name) {
                const query = slots.target_name as string;
                const results = await geminiService.searchUsers(query);
                setSearchResults(results);
                onNavigate(AppView.SEARCH_RESULTS, { query });
            }
            break;
          case 'intent_scroll_down':
              onSetScrollState(ScrollState.DOWN);
              break;
          case 'intent_scroll_up':
              onSetScrollState(ScrollState.UP);
              break;
          case 'intent_stop_scroll':
              onSetScrollState(ScrollState.NONE);
              break;
          case 'intent_help':
              onNavigate(AppView.HELP);
              onSetTtsMessage("Opening the command list.");
              break;
          default:
              onSetTtsMessage(getTtsPrompt('error_generic', language));
              break;
        }
    } catch (error) {
        console.error("Error processing command in FeedScreen:", error);
        onSetTtsMessage(getTtsPrompt('error_generic', language));
    } finally {
        onCommandProcessed();
    }
  }, [
      visiblePosts, currentPostIndex, friends, onOpenProfile, onReactToPost, onOpenComments, onSetTtsMessage, onStartCreatePost, 
      onNavigate, onSetScrollState, setSearchResults, onCommandProcessed, fetchRewardedCampaign, onSharePost, language, currentUser,
      onSavePost, onHidePost, onCopyLink, onReportPost, onOpenPhotoViewer, posts, onDeletePost
  ]);


  useEffect(() => {
    if (lastCommand) {
      handleCommand(lastCommand);
    }
  }, [lastCommand, handleCommand]);

  useEffect(() => {
    if (isInitialLoad.current || visiblePosts.length === 0 || currentPostIndex < 0 || !isProgrammaticScroll.current) return;

    const cardElement = postRefs.current[currentPostIndex];
    if (cardElement) {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const scrollTimeout = setTimeout(() => {
            isProgrammaticScroll.current = false;
        }, 1000); 
        
        return () => clearTimeout(scrollTimeout);
    }
  }, [currentPostIndex, visiblePosts]);

  useEffect(() => {
    if (isInitialLoad.current || visiblePosts.length === 0 || currentPostIndex < 0) return;
    
    const activePost = visiblePosts[currentPostIndex];
    if (activePost?.isSponsored && activePost.campaignId) {
        onAdViewed(activePost.campaignId);
    }
  }, [currentPostIndex, visiblePosts, onAdViewed]);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            if (isProgrammaticScroll.current) return;

            const intersectingEntries = entries.filter(entry => entry.isIntersecting);
            if (intersectingEntries.length > 0) {
                const mostVisibleEntry = intersectingEntries.reduce((prev, current) => 
                    prev.intersectionRatio > current.intersectionRatio ? prev : current
                );
                
                const indexStr = (mostVisibleEntry.target as HTMLElement).dataset.index;
                if (indexStr) {
                    const index = parseInt(indexStr, 10);
                    if (currentPostIndexRef.current !== index) {
                         setCurrentPostIndex(index);
                         setIsPlaying(false);
                    }
                }
            }
        },
        { 
            root: feedContainerRef.current,
            threshold: 0.6, 
        }
    );

    const currentPostRefs = postRefs.current;
    currentPostRefs.forEach(ref => {
        if (ref) observer.observe(ref);
    });

    return () => {
        currentPostRefs.forEach(ref => {
            if (ref) observer.unobserve(ref);
        });
    };
  }, [visiblePosts]);


  useEffect(() => {
    if (posts.length > 0 && !isLoading && isInitialLoad.current) {
        isInitialLoad.current = false;
    }
  }, [posts, isLoading]);

  if (isLoading) {
    return (
      <div className="w-full max-w-lg md:max-w-2xl mx-auto flex flex-col items-center gap-6">
          <SkeletonPostCard />
          <SkeletonPostCard />
          <SkeletonPostCard />
      </div>
    );
  }

  return (
    <div ref={feedContainerRef} className="w-full max-w-lg md:max-w-2xl mx-auto flex flex-col items-center gap-6">
        <StoriesTray 
            currentUser={currentUser}
            storiesByAuthor={storiesByAuthor}
            onCreateStory={() => onNavigate(AppView.CREATE_STORY)}
            onViewStories={(initialUserIndex) => onNavigate(AppView.STORY_VIEWER, { storiesByAuthor, initialUserIndex })}
        />
        <CreatePostWidget 
            user={currentUser} 
            onStartCreatePost={onStartCreatePost}
        />
        <div className="w-full border-t border-fuchsia-500/20" />
        <RewardedAdWidget campaign={rewardedCampaign} onAdClick={onRewardedAdClick} />
        {visiblePosts.filter(Boolean).map((post, index) => (
            <div 
                key={`${post.id}-${index}`} 
                className="w-full"
                ref={el => { postRefs.current[index] = el; }}
                data-index={index}
            >
                <PostCard 
                    post={post} 
                    currentUser={currentUser}
                    isActive={index === currentPostIndex}
                    isPlaying={isPlaying && index === currentPostIndex}
                    onPlayPause={() => {
                        if (post.isSponsored && (post.videoUrl || post.imageUrl)) return;
                        if (index === currentPostIndex) {
                            setIsPlaying(p => !p)
                        } else {
                            isProgrammaticScroll.current = true;
                            setCurrentPostIndex(index);
                            setIsPlaying(true);
                        }
                    }}
                    onReact={onReactToPost}
                    onOpenComments={onOpenComments}
                    onAuthorClick={onOpenProfile}
                    onAdClick={onAdClick}
                    onSharePost={onSharePost}
                    onShareAsStory={onShareAsStory}
                    onOpenPhotoViewer={onOpenPhotoViewer}
                    onDeletePost={onDeletePost}
                    onReportPost={onReportPost}
                    isSaved={currentUser.savedPostIds?.includes(post.id)}
                    onSavePost={onSavePost}
                    onCopyLink={onCopyLink}
                    onHidePost={onHidePost}
                />
            </div>
        ))}
    </div>
  );
};

export default FeedScreen;
