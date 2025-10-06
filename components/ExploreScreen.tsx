import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Post, User, CategorizedExploreFeed, Comment } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import PostCarousel from './PostCarousel';
import { PostCard } from './PostCard';

// Helper hook to detect mobile screen sizes
const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return isMobile;
};

interface ExploreScreenProps {
  currentUser: User;
  onReactToPost: (postId: string, emoji: string) => void;
  onOpenComments: (post: Post, commentToReplyTo?: Comment) => void;
  onOpenProfile: (userName: string) => void;
  onSharePost: (post: Post) => void;
  onOpenPhotoViewer: (post: Post, initialUrl?: string) => void;
  onDeletePost: (postId: string) => void;
  onReportPost: (post: Post) => void;
  onHidePost: (postId: string) => void;
  onSavePost: (post: Post, isSaving: boolean) => void;
  onCopyLink: (post: Post) => void;
}

const SkeletonCarousel: React.FC<{ title: string }> = ({ title }) => (
    <div>
        <div className="h-8 bg-slate-700 rounded w-1/3 mb-4 animate-pulse"></div>
        <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="w-80 flex-shrink-0">
                    <div className="bg-slate-800 rounded-2xl p-6 w-full mx-auto overflow-hidden relative">
                        <div className="animate-pulse flex flex-col gap-5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-slate-700"></div>
                                <div className="flex-1 space-y-2">
                                <div className="h-4 bg-slate-700 rounded w-1/2"></div>
                                <div className="h-3 bg-slate-700 rounded w-1/4"></div>
                                </div>
                            </div>
                            <div className="h-24 bg-slate-700 rounded-lg"></div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

const MobileGridSkeleton: React.FC = () => (
    <div className="layout-masonry animate-pulse p-1">
        {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="masonry-item">
                <div 
                    className="w-full bg-slate-700/50 rounded-lg"
                    style={{ height: `${Math.random() * 100 + 150}px` }}
                ></div>
            </div>
        ))}
    </div>
);

const TrendingSection: React.FC<{
    posts: Post[];
    postCardProps: Omit<React.ComponentProps<typeof PostCard>, 'post'>;
}> = ({ posts, postCardProps }) => {
    if (!posts || posts.length === 0) return null;

    const mainPost = posts[0];
    const otherPosts = posts.slice(1, 5); // Take next 4

    return (
        <section>
            <h2 className="text-3xl font-bold text-slate-100 mb-4">Trending</h2>
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Main Post */}
                <div className="lg:w-[60%] flex-shrink-0">
                    <PostCard post={mainPost} {...postCardProps} isSaved={postCardProps.currentUser?.savedPostIds?.includes(mainPost.id)} />
                </div>
                {/* Other Posts Grid */}
                {otherPosts.length > 0 && (
                    <div className="lg:w-[40%] grid grid-cols-2 gap-4">
                        {otherPosts.map(post => {
                            const previewUrl = post.imageUrl || post.videoUrl || post.imageDetails?.[0]?.url || post.author.avatarUrl;
                            return (
                                <button
                                    key={post.id}
                                    onClick={() => postCardProps.onOpenPhotoViewer(post, previewUrl)}
                                    className="aspect-square bg-slate-800 rounded-lg overflow-hidden relative group"
                                >
                                    <img src={previewUrl} alt={post.caption} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                                    <div className="absolute bottom-2 left-2 right-2 text-white">
                                        <div className="flex items-center gap-2">
                                            <img src={post.author.avatarUrl} alt={post.author.name} className="w-6 h-6 rounded-full border-2 border-slate-900" />
                                            <p className="text-xs font-semibold truncate">{post.author.name}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};


const ExploreScreen: React.FC<ExploreScreenProps> = (props) => {
    const { currentUser, ...restOfProps } = props;

    const [categorizedFeed, setCategorizedFeed] = useState<CategorizedExploreFeed | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const isMobile = useIsMobile();

    // Mobile-specific state
    const [activeTabKey, setActiveTabKey] = useState<keyof CategorizedExploreFeed>('forYou');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const touchStartRef = useRef(0);
    const pullDistanceRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchExploreFeed = useCallback(async () => {
        if (!isRefreshing) setIsLoading(true);
        setError(null);
        try {
            const feed = await geminiService.getCategorizedExploreFeed(currentUser.id);
            setCategorizedFeed(feed);
        } catch (err) {
            console.error("Failed to fetch categorized explore feed:", err);
            setError("Could not load Explore feed. Please try again later.");
        } finally {
            setIsLoading(false);
            if (isRefreshing) setIsRefreshing(false);
        }
    }, [currentUser.id, isRefreshing]);

    useEffect(() => {
        fetchExploreFeed();
    }, []); // Only on initial mount

    // --- Pull-to-refresh logic ---
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !isMobile) return;

        const handleTouchStart = (e: TouchEvent) => {
            if (container.scrollTop === 0) {
                touchStartRef.current = e.touches[0].clientY;
                container.style.transition = 'transform 0.2s';
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (touchStartRef.current > 0) {
                const pullDistance = e.touches[0].clientY - touchStartRef.current;
                if (pullDistance > 0) {
                    e.preventDefault(); // Prevent browser's native pull-to-refresh
                    pullDistanceRef.current = pullDistance;
                    const limitedPull = Math.min(pullDistance, 100);
                    container.style.transform = `translateY(${limitedPull}px)`;
                }
            }
        };

        const handleTouchEnd = () => {
            if (pullDistanceRef.current > 80) { // Refresh threshold
                setIsRefreshing(true);
                fetchExploreFeed();
            }
            container.style.transform = 'translateY(0px)';
            touchStartRef.current = 0;
            pullDistanceRef.current = 0;
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isMobile, fetchExploreFeed]);

    const commonPostCardProps = {
        ...restOfProps,
        currentUser,
        isActive: true, 
        isPlaying: false,
        onPlayPause: () => {},
    };

    const categories = useMemo(() => {
        if (!categorizedFeed) return [];
        return [
            { key: 'forYou', title: 'For You', posts: categorizedFeed.forYou },
            { key: 'trending', title: 'Trending', posts: categorizedFeed.trending },
            { key: 'recent', title: 'Recent Posts', posts: categorizedFeed.recent },
            { key: 'funnyVoiceNotes', title: 'Funny Notes', posts: categorizedFeed.funnyVoiceNotes },
            { key: 'newTalent', title: 'New Talent', posts: categorizedFeed.newTalent },
        ].filter(cat => cat.posts && cat.posts.length > 0);
    }, [categorizedFeed]);

    const renderDesktopView = () => (
        <div className="h-full w-full overflow-y-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-12">
                <header>
                    <h1 className="text-4xl font-bold text-slate-100">Explore</h1>
                    <p className="text-slate-400 mt-1">Discover AI-curated content from across VoiceBook.</p>
                </header>
                 {isLoading ? (
                    <>
                        <SkeletonCarousel title="Trending" />
                        <SkeletonCarousel title="For You" />
                    </>
                ) : (
                    categories.map(cat => (
                        cat.key === 'trending' ? (
                            <TrendingSection key={cat.key} posts={cat.posts} postCardProps={commonPostCardProps} />
                        ) : (
                            <PostCarousel key={cat.key} title={cat.title} posts={cat.posts} postCardProps={commonPostCardProps} />
                        )
                    ))
                )}
            </div>
        </div>
    );
    
    const renderMobileView = () => {
        const activePosts = categorizedFeed?.[activeTabKey] || [];
        
        return (
            <div className="h-full w-full flex flex-col">
                <header className="flex-shrink-0 p-2 border-b border-fuchsia-500/20 bg-black/30 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {categories.map(cat => (
                            <button
                                key={cat.key}
                                onClick={() => setActiveTabKey(cat.key as keyof CategorizedExploreFeed)}
                                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex-shrink-0 ${
                                    activeTabKey === cat.key
                                        ? 'bg-fuchsia-600 text-white'
                                        : 'bg-slate-700/80 text-slate-300 hover:bg-slate-700'
                                }`}
                            >
                                {cat.title}
                            </button>
                        ))}
                    </div>
                </header>
                <div ref={containerRef} className="flex-grow overflow-y-auto relative pb-16">
                    {isRefreshing && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800 p-2 rounded-full z-20">
                            <Icon name="logo" className="w-6 h-6 text-fuchsia-400 animate-spin" />
                        </div>
                    )}
                    {isLoading ? <MobileGridSkeleton /> : (
                         <div className="layout-masonry p-1">
                            {activePosts.map(post => {
                                const previewUrl = post.imageUrl || post.videoUrl || post.imageDetails?.[0]?.url || post.author.avatarUrl;
                                return (
                                    <button 
                                        key={post.id} 
                                        className="masonry-item relative group"
                                        onClick={() => props.onOpenPhotoViewer(post, previewUrl)}
                                    >
                                        <img src={previewUrl} alt={post.caption} />
                                        {activeTabKey === 'trending' && (
                                            <div className="absolute bottom-2 left-2 bg-rose-600/80 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                                                <span>🔥</span>
                                                <span>Trending</span>
                                            </div>
                                        )}
                                        {(post.videoUrl || post.audioUrl) && <Icon name="play" className="w-6 h-6 text-white absolute top-2 right-2 drop-shadow-lg" />}
                                        {post.imageDetails && post.imageDetails.length > 1 && <Icon name="photo" className="w-6 h-6 text-white absolute top-2 left-2 drop-shadow-lg" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (error) {
        return <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center text-red-400"><Icon name="close" className="w-16 h-16" /><h2 className="text-2xl font-bold">An Error Occurred</h2><p>{error}</p></div>;
    }

    const isEmpty = !isLoading && (!categorizedFeed || Object.values(categorizedFeed).every(arr => Array.isArray(arr) && arr.length === 0));

    if (isEmpty) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-8 p-8 text-center">
                <Icon name="compass" className="w-24 h-24 text-slate-600" />
                <h2 className="text-slate-300 text-2xl font-bold">Nothing to explore yet</h2>
                <p className="text-slate-400 max-w-sm">It looks like there are no public posts available right now. Check back later!</p>
            </div>
        );
    }

    return isMobile ? renderMobileView() : renderDesktopView();
};

export default ExploreScreen;
