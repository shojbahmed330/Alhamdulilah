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
    onSharePost, onOpenPhotoViewer, onDeletePost, onReportPost, hiddenPostIds, onHidePost, onSavePost, onCopyLink
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
      const adStory = await firebaseService.getInjectableStoryAd(currentUser);
  
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
            const adPost = await firebaseService.getInjectableAd(currentUser);
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
        // Use index 0 as a fallback if no post is actively selected yet.
        const postIndex = (currentPostIndex < 0 && visiblePosts.length > 0) ? 0 : currentPostIndex;
        const activePost = visiblePosts[postIndex];

        const userNamesOnScreen = posts.map(p => p.isSponsored ? p.sponsorName as string : p.author.name);
        const allContextNames = [...userNamesOnScreen, ...friends.map(f => f.name)];
        
        const intentResponse = await geminiService.processIntent(command, { 
            userNames: [...new Set(allContextNames)],
            active_author_name: activePost ? activePost.author.name : undefined
        });
        
        // --- DEFENSIVE LOGIC ---
        // Check if the command is a generic one that refers to the current post context.
        const isGenericPostCommand = /this post|ei post|ei chobi|post ti|post ta/i.test(command.toLowerCase());
        
        // If it's a generic command and the AI hallucinated a target_name, delete it.
        // This forces the app to use the `activePost` context.
        if (isGenericPostCommand && intentResponse.slots?.target_name) {
            console.warn(`Defensive override: Ignoring hallucinated target_name '${intentResponse.slots.target_name}' for generic command.`);
            delete intentResponse.slots.target_name;
        }
        // --- END DEFENSIVE LOGIC ---

        const { intent, slots } = intentResponse;

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
            if (postIndex < 0 && visiblePosts.length > 0) {
                isProgrammaticScroll.current = true;
                setCurrentPostIndex(0);
            }
            setIsPlaying(true);
            break;
          case 'intent_pause_post':
            setIsPlaying(false);
            break;
          case 'intent_react_to_post':
            if (activePost && slots?.reaction_type) {
                const reactionKey = (slots.reaction_type as string).toLowerCase();
                const emoji = VOICE_EMOJI_MAP[reactionKey] || '👍'; // Default to like
                onReactToPost(activePost.id, emoji);
                onSetTtsMessage(`Reacted with ${emoji} to ${activePost.author.name}'s post.`);
            }
            break;
          case 'intent_share':
            if (activePost) {
                onSharePost(activePost);
            } else {
                onSetTtsMessage("Please select a post to share by playing it or navigating to it.");
            }
            break;
          case 'intent_save_post':
            if (activePost) {
                onSavePost(activePost, true);
            }
            break;
          case 'intent_hide_post':
            if (activePost) {
                onHidePost(activePost.id);
            }
            break;
          case 'intent_copy_link':
            if (activePost) {
                onCopyLink(activePost);
            }
            break;
          case 'intent_report_post':
            if (activePost) {
                onReportPost(activePost);
            }
            break;
            
          // Consolidated block for all actions that target a post (either by name or context)
          case 'intent_add_comment_text':
          case 'intent_open_post_viewer':
          case 'intent_comment':
          case 'intent_view_comments':
          case 'intent_view_comments_by_author': {
                let targetPost: Post | null = null;
                
                // If a specific name was given (and not overridden by defensive logic), find that post.
                if (slots?.target_name) {
                    targetPost = visiblePosts.find(p => !p.isSponsored && p.author.name.toLowerCase() === (slots.target_name as string).toLowerCase()) || null;
                } else {
                    // Otherwise, use the active post from the screen context.
                    targetPost = activePost;
                }

                if (targetPost) {
                    if (intent === 'intent_open_post_viewer') {
                        onOpenPhotoViewer(targetPost);
                    } else { // All other intents in this block are comment-related
                        const commentText = slots?.comment_text as string | undefined;
                        onOpenComments(targetPost, undefined, commentText);
                        if (commentText) {
                             onSetTtsMessage(`Comment text added. Say 'post comment' to publish.`);
                        }
                    }
                } else if (slots?.target_name) {
                    onSetTtsMessage(`I can't find a post by ${slots.target_name} on your screen.`);
                } else {
                    onSetTtsMessage(`Sorry, I couldn't figure out which post you meant.`);
                }
                break;
            }

          case 'intent_add_text_to_story':
            if (slots?.text) {
                onNavigate(AppView.CREATE_STORY, { initialText: slots.text as string });
            }
            break;
          case 'intent_create_story':
              onNavigate(AppView.CREATE_STORY);
              break;
          case 'intent_open_profile':
            if (slots?.target_name) {
              onOpenProfile(slots.target_name as string);
            } else {
              onOpenProfile(currentUser.username);
            }
            break;
          case 'intent_create_post':
              onStartCreatePost();
              break;
          case 'intent_create_voice_post':
              onStartCreatePost({ startRecording: true });
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
              onNavigate(AppView.FRIENDS);
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
      onSavePost, onHidePost, onCopyLink, onReportPost, onOpenPhotoViewer, posts
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