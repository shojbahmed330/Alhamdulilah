import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Post, User, Comment } from '../types';
import Icon from './Icon';
import CommentCard from './CommentCard';
import TaggedContent from './TaggedContent';
import ReactionListModal from './ReactionListModal';
import { geminiService } from '../services/geminiService';

interface ImageModalProps {
  post: Post | null;
  currentUser: User;
  isLoading: boolean;
  initialUrl?: string;
  onClose: () => void;
  onReactToPost: (postId: string, emoji: string) => void;
  onReactToImage: (postId: string, imageId: string, emoji: string) => void;
  onReactToComment: (postId: string, commentId: string, emoji: string) => void;
  onPostComment: (postId: string, text: string, parentId?: string | null, imageId?: string) => Promise<void>;
  onEditComment: (postId: string, commentId: string, newText: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onDeletePost: (postId: string) => void;
  onReportPost: (post: Post) => void;
  onReportComment: (comment: Comment) => void;
  onOpenProfile: (userName: string) => void;
  onSharePost: (post: Post) => void;
  onOpenCommentsSheet: (post: Post, commentToReplyTo?: Comment, initialText?: string) => void;
  lastCommand?: string | null;
  onCommandProcessed?: () => void;
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

const ImageModal: React.FC<ImageModalProps> = ({ post, currentUser, isLoading, initialUrl, onClose, onReactToPost, onReactToImage, onReactToComment, onPostComment, onEditComment, onDeleteComment, onOpenProfile, onSharePost, onOpenCommentsSheet, onDeletePost, onReportPost, onReportComment, lastCommand, onCommandProcessed }) => {
  if (!post || !post.author) {
    return null;
  }
  
  const [playingCommentId, setPlayingCommentId] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isReactionModalOpen, setIsReactionModalOpen] = useState(false);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const pickerTimeout = useRef<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const isMobile = window.innerWidth < 768;

  const imageDetails = useMemo(() => {
    if (post?.imageDetails && post.imageDetails.length > 0) return post.imageDetails;
    if (post?.imageUrl) return [{ id: 'single_img_placeholder', url: post.imageUrl, caption: undefined }];
    if (post?.newPhotoUrl) return [{ id: 'profile_cover_placeholder', url: post.newPhotoUrl, caption: post.caption }];
    return [];
  }, [post]);

  const allImages = useMemo(() => imageDetails.map(d => d.url), [imageDetails]);
  const currentImageDetail = imageDetails[currentIndex];
  const isMultiImagePost = imageDetails.length > 1;

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex(i => (i === 0 ? allImages.length - 1 : i - 1));
  }, [allImages.length]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex(i => (i === allImages.length - 1 ? 0 : i + 1));
  }, [allImages.length]);

  const handlePostCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !newCommentText.trim() || isPostingComment) return;
    const imageIdForComment = isMultiImagePost ? currentImageDetail?.id : undefined;
    setIsPostingComment(true);
    try {
        await onPostComment(post.id, newCommentText, replyingTo?.id || null, imageIdForComment);
        setNewCommentText('');
        setReplyingTo(null);
    } catch (error) {
        console.error("Failed to post comment:", error);
    } finally {
        setIsPostingComment(false);
    }
  }, [post, newCommentText, isPostingComment, isMultiImagePost, currentImageDetail, onPostComment, replyingTo]);


  useEffect(() => {
    const handleCommand = async () => {
        if (!lastCommand || !onCommandProcessed) return;

        try {
            const intentResponse = await geminiService.processIntent(lastCommand);
            switch (intentResponse.intent) {
                case 'intent_next_image':
                case 'intent_next_post':
                    handleNext();
                    break;
                case 'intent_previous_image':
                case 'intent_previous_post':
                    handlePrev();
                    break;
                case 'intent_go_back':
                    onClose();
                    break;
                case 'intent_add_comment_to_image':
                    if (intentResponse.slots?.comment_text) {
                        setNewCommentText(intentResponse.slots.comment_text as string);
                        commentInputRef.current?.focus();
                    }
                    break;
                case 'intent_post_comment':
                    if (newCommentText.trim()) {
                        handlePostCommentSubmit({ preventDefault: () => {} } as React.FormEvent);
                    }
                    break;
            }
        } catch (error) {
            console.error("Error processing command in ImageModal:", error);
        } finally {
            onCommandProcessed();
        }
    };
    handleCommand();
  }, [lastCommand, onCommandProcessed, handleNext, handlePrev, onClose, newCommentText, handlePostCommentSubmit]);


  useEffect(() => {
    if (initialUrl && allImages.length > 0) {
      const startIndex = allImages.indexOf(initialUrl);
      setCurrentIndex(startIndex !== -1 ? startIndex : 0);
    } else if (allImages.length > 0) {
      setCurrentIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]); // Only run when the initialUrl prop changes, not when the post updates.


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (allImages.length > 1) {
          if (e.key === 'ArrowLeft') setCurrentIndex(i => (i === 0 ? allImages.length - 1 : i - 1));
          if (e.key === 'ArrowRight') setCurrentIndex(i => (i === allImages.length - 1 ? 0 : i + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [onClose, allImages]);

  useEffect(() => {
    if (replyingTo) {
        commentInputRef.current?.focus();
    }
  }, [replyingTo]);

  const commentsForCurrentImage = useMemo(() => {
    if (!post?.comments) return [];
    if (isMultiImagePost && currentImageDetail) {
        return post.comments.filter(c => c.imageId === currentImageDetail.id);
    }
    return post.comments.filter(c => !c.imageId);
  }, [post?.comments, currentIndex, imageDetails, currentImageDetail, isMultiImagePost]);
  
  const commentThreads = useMemo(() => {
    if (!commentsForCurrentImage) return [];
    const comments = [...commentsForCurrentImage].filter(Boolean).sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const commentsById = new Map<string, Comment & { replies: Comment[] }>();
    comments.forEach(c => commentsById.set(c.id, { ...c, replies: [] }));
    const topLevelComments: (Comment & { replies: Comment[] })[] = [];
    comments.forEach(c => {
        const commentWithReplies = commentsById.get(c.id);
        if (!commentWithReplies) return;
        if (c.parentId && commentsById.has(c.parentId)) {
            commentsById.get(c.parentId)?.replies.push(commentWithReplies);
        } else {
            topLevelComments.push(commentWithReplies);
        }
    });
    return topLevelComments;
  }, [commentsForCurrentImage]);

  const handlePlayComment = (comment: Comment) => {
    if (comment.type !== 'audio') return;
    setPlayingCommentId(prev => prev === comment.id ? null : comment.id);
  };
  
  const handleMouseEnterPicker = () => {
    if (pickerTimeout.current) clearTimeout(pickerTimeout.current);
    setPickerOpen(true);
  };

  const handleMouseLeavePicker = () => {
    pickerTimeout.current = window.setTimeout(() => {
        setPickerOpen(false);
    }, 300);
  };

  const handleReaction = (e: React.MouseEvent, emoji: string) => {
      e.stopPropagation();
      if (post && isMultiImagePost && currentImageDetail?.id) {
          onReactToImage(post.id, currentImageDetail.id, emoji);
      } else if (post) {
          onReactToPost(post.id, emoji);
      }
      setPickerOpen(false);
  };

  const currentReactions = useMemo(() => {
    if (isMultiImagePost && currentImageDetail?.id) {
        return post.imageReactions?.[currentImageDetail.id] || {};
    }
    return post.reactions || {};
  }, [post, isMultiImagePost, currentImageDetail]);

  const myReaction = useMemo(() => {
    if (!currentUser) return null;
    return currentReactions[currentUser.id] || null;
  }, [currentUser, currentReactions]);

  const reactionCount = useMemo(() => Object.keys(currentReactions).length, [currentReactions]);

  const topReactions = useMemo(() => {
    const counts: { [key: string]: number } = {};
    Object.values(currentReactions).forEach(emoji => {
        counts[emoji as string] = (counts[emoji as string] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  }, [currentReactions]);

  const CommentWithReplies: React.FC<{
    comment: Comment & { replies: Comment[] };
    isReply?: boolean;
  }> = ({ comment, isReply = false }) => {
      return (
          <div className="flex flex-col gap-3">
              <div>
                  <CommentCard
                      comment={comment}
                      currentUser={currentUser}
                      isPlaying={playingCommentId === comment.id}
                      onPlayPause={() => handlePlayComment(comment)}
                      onAuthorClick={onOpenProfile}
                      onReply={setReplyingTo}
                      onReact={(commentId, emoji) => post && onReactToComment(post.id, commentId, emoji)}
                      onEdit={(commentId, newText) => post && onEditComment(post.id, commentId, newText)}
                      onDelete={(commentId) => post && onDeleteComment(post.id, commentId)}
                      onReportComment={onReportComment}
                      isReply={isReply}
                  />
              </div>
              {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-6 pl-4 border-l-2 border-slate-700 space-y-3">
                      {comment.replies.map(reply => (
                          <CommentWithReplies
                              key={reply.id}
                              comment={reply as Comment & { replies: Comment[] }}
                              isReply={true}
                          />
                      ))}
                  </div>
              )}
          </div>
      );
  };

  if (isLoading) {
    return (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center">
            <Icon name="logo" className="w-16 h-16 text-fuchsia-500 animate-spin" />
        </div>
    );
  }
  
  if (allImages.length === 0) {
    onClose();
    return null;
  }

  return (
    <>
    <div
      className="fixed inset-0 bg-black/85 z-50 flex flex-col md:flex-row items-stretch"
      onClick={onClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 p-2 rounded-full text-white bg-black/30 hover:bg-black/60 transition-colors z-[51]"
        aria-label="Close image viewer"
      >
        <Icon name="close" className="w-8 h-8" />
      </button>
      
      <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative" onClick={(e) => e.stopPropagation()}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <Icon name="logo" className="w-16 h-16 text-fuchsia-500 animate-spin"/>
            </div>
          )}
          <img
            key={allImages[currentIndex]} // Add key to force re-render on image change
            src={allImages[currentIndex]}
            alt="Full screen view"
            className={`max-w-full max-h-full object-contain rounded-lg transition-opacity animate-fade-in-fast ${isLoading ? 'opacity-50' : 'opacity-100'}`}
          />

          {allImages.length > 1 && (
              <>
                  <button onClick={(e) => handlePrev(e)} className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/70 rounded-full transition-colors text-white" aria-label="Previous image">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <button onClick={(e) => handleNext(e)} className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/70 rounded-full transition-colors text-white" aria-label="Next image">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm font-semibold">
                      {currentIndex + 1} / {allImages.length}
                  </div>
              </>
          )}

      </main>

      <aside className={`w-full h-auto md:h-auto md:w-[380px] flex-shrink-0 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-700/50 flex flex-col transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`} onClick={(e) => e.stopPropagation()}>
          <header className="p-4 border-b border-slate-700">
              <div className="flex items-start justify-between">
                <button onClick={() => onOpenProfile(post.author.username)} className="flex items-center gap-3 group flex-grow">
                    <img src={post.author.avatarUrl} alt={post.author.name} className="w-12 h-12 rounded-full" />
                    <div>
                    <p className="font-bold text-lg text-fuchsia-300 group-hover:underline">{post.author.name}</p>
                    <p className="text-sm text-slate-400">{new Date(post.createdAt).toLocaleString()}</p>
                    </div>
                </button>
                <div className="relative" ref={actionMenuRef}>
                    <button onClick={() => setIsActionMenuOpen(p => !p)}>
                        <Icon name="ellipsis-vertical" className="w-6 h-6 text-slate-400" />
                    </button>
                    {isActionMenuOpen && (
                        <div className="absolute top-full right-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 text-sm font-semibold">
                            {post.author.id === currentUser.id ? (
                                <button onClick={() => onDeletePost(post.id)} className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-500/10">Delete Post</button>
                            ) : (
                                <button onClick={() => onReportPost(post)} className="w-full text-left px-4 py-2 text-yellow-400 hover:bg-yellow-500/10">Report Post</button>
                            )}
                        </div>
                    )}
                </div>
              </div>
              {post.caption && (
                <p className="text-slate-200 mt-3"><TaggedContent text={post.caption} onTagClick={onOpenProfile} /></p>
              )}
              {currentImageDetail?.caption && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-slate-300 italic">{currentImageDetail.caption}</p>
                  </div>
              )}
          </header>
          
          <div className="px-4 py-2 border-b border-slate-700">
             {(reactionCount > 0 || commentsForCurrentImage.length > 0) && (
                <div className="flex items-center justify-between py-2">
                    <button onClick={() => setIsReactionModalOpen(true)} className="flex items-center">
                        {topReactions.map(emoji => 
                            <span key={emoji} className="text-lg -ml-1 border-2 border-slate-900 rounded-full">{emoji}</span>
                        )}
                        <span className="text-sm text-fuchsia-500 ml-2 hover:underline">{reactionCount}</span>
                    </button>
                    <button onClick={() => isMobile ? onOpenCommentsSheet(post) : commentInputRef.current?.focus()} className="text-sm text-fuchsia-500 hover:underline">{commentsForCurrentImage.length || 0} comments</button>
                </div>
              )}
          </div>
          
           <div className="flex items-center text-fuchsia-400 gap-1 p-2 border-b border-slate-700">
                <div onMouseEnter={handleMouseEnterPicker} onMouseLeave={handleMouseLeavePicker} className="relative flex-1">
                    {isPickerOpen && (
                        <div onMouseEnter={handleMouseEnterPicker} onMouseLeave={handleMouseLeavePicker} className="absolute bottom-full mb-2 bg-slate-900/90 backdrop-blur-sm border border-fuchsia-500/20 rounded-full p-1.5 flex items-center gap-1 shadow-lg animate-fade-in-fast">
                            {REACTIONS.map(emoji => (
                                <button key={emoji} onClick={(e) => handleReaction(e, emoji)} className="text-3xl p-1 rounded-full hover:bg-slate-700/50 transition-transform hover:scale-125">
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                    <button onClick={(e) => handleReaction(e, myReaction || '👍')} className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors duration-200 ${myReaction ? 'text-fuchsia-400 font-bold' : 'text-fuchsia-400/80'}`}>
                        {myReaction ? <span className="text-xl">{myReaction}</span> : <Icon name="like" className="w-6 h-6" />}
                        <span className="font-semibold text-base">React</span>
                    </button>
                </div>
               <button onClick={(e) => { e.stopPropagation(); if (isMobile) { onOpenCommentsSheet(post); } else { commentInputRef.current?.focus(); } }} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors duration-200 text-fuchsia-400/80">
                <Icon name="comment" className="w-6 h-6" />
                <span className="font-semibold text-base">Comment</span>
              </button>
              <button onClick={() => onSharePost(post)} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors duration-200 text-fuchsia-400/80">
                <Icon name="share" className="w-6 h-6" />
                <span className="font-semibold text-base">Share</span>
              </button>
          </div>
          
          {!isMobile && (
              <>
                <div className="flex-grow overflow-y-auto p-4 space-y-3">
                    {commentThreads.length > 0 ? commentThreads.map(comment => (
                        <CommentWithReplies key={comment.id} comment={comment} />
                    )) : (
                        <p className="text-center text-slate-500 pt-8">No comments yet for this image.</p>
                    )}
                </div>

                <footer className="p-3 border-t border-slate-700">
                    {replyingTo && (
                        <div className="text-xs text-slate-400 px-2 pb-2 flex justify-between items-center">
                            <span>Replying to {replyingTo.author.name}</span>
                            <button onClick={() => setReplyingTo(null)} className="font-bold">Cancel</button>
                        </div>
                    )}
                    <form onSubmit={handlePostCommentSubmit} className="flex items-center gap-2">
                        <img src={currentUser.avatarUrl} alt="Your avatar" className="w-9 h-9 rounded-full" />
                        <input
                            ref={commentInputRef}
                            type="text"
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            placeholder="Write a comment..."
                            className="flex-grow bg-slate-800 border border-slate-700 text-slate-100 rounded-full py-2.5 px-4 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                        />
                        <button
                            type="submit"
                            disabled={isPostingComment || !newCommentText.trim()}
                            className="p-2.5 rounded-full bg-fuchsia-600 text-white hover:bg-fuchsia-500 disabled:bg-slate-500 disabled:cursor-not-allowed"
                            aria-label="Post comment"
                        >
                            <Icon name="paper-airplane" className="w-5 h-5" />
                        </button>
                    </form>
                </footer>
              </>
          )}
      </aside>
    </div>
    {isReactionModalOpen && (
        <ReactionListModal
            isOpen={isReactionModalOpen}
            onClose={() => setIsReactionModalOpen(false)}
            reactions={currentReactions || {}}
        />
    )}
    </>
  );
};

export default ImageModal;