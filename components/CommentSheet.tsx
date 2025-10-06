import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Post, User, Comment } from '../types';
import { PostCard } from './PostCard';
import CommentCard from './CommentCard';
import { firebaseService } from '../services/firebaseService';
import Icon from './Icon';
import { getTtsPrompt } from '../constants';
import { useSettings } from '../contexts/SettingsContext';
import { geminiService } from '../services/geminiService';

interface CommentSheetProps {
  initialPost: Post;
  commentToReplyTo?: Comment;
  currentUser: User;
  onClose: () => void;
  onReactToPost: (postId: string, emoji: string) => void;
  onReactToComment: (postId: string, commentId: string, emoji: string) => void;
  onPostComment: (postId: string, text: string, parentId?: string | null, imageId?: string) => Promise<void>;
  onEditComment: (postId: string, commentId: string, newText: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onOpenProfile: (userName: string) => void;
  onSharePost: (post: Post) => void;
  onOpenPhotoViewer: (post: Post, initialUrl?: string) => void;
  onReportPost: (post: Post) => void;
  onReportComment: (comment: Comment) => void;
  initialText?: string;
  lastCommand: string | null;
  onCommandProcessed: () => void;
  onDeletePost: (postId: string) => void;
}

const CommentSheet: React.FC<CommentSheetProps> = ({
  initialPost,
  commentToReplyTo,
  currentUser,
  onClose,
  onReactToPost,
  onReactToComment,
  onPostComment,
  onEditComment,
  onDeleteComment,
  onOpenProfile,
  onSharePost,
  onOpenPhotoViewer,
  onReportPost,
  onReportComment,
  initialText,
  lastCommand,
  onCommandProcessed,
  onDeletePost,
}) => {
  const [post, setPost] = useState<Post | null>(initialPost);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingCommentId, setPlayingCommentId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(commentToReplyTo || null);
  const [newCommentText, setNewCommentText] = useState(initialText || '');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { language } = useSettings();

  useEffect(() => {
    const unsubscribe = firebaseService.listenToPost(initialPost.id, (livePost) => {
      setPost(livePost);
    });
    return unsubscribe;
  }, [initialPost.id]);
  
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 300); // Wait for animation to finish
  };

  const handlePostCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !newCommentText.trim() || isPostingComment) return;
    setIsPostingComment(true);
    try {
      await onPostComment(post.id, newCommentText, replyingTo?.id || null);
      setNewCommentText('');
      setReplyingTo(null);
    } catch (error) {
      console.error("Failed to post comment:", error);
    } finally {
      setIsPostingComment(false);
    }
  }, [post, newCommentText, isPostingComment, onPostComment, replyingTo]);

  useEffect(() => {
    if (replyingTo) {
        commentInputRef.current?.focus();
        setNewCommentText(`@${replyingTo.author.username} `);
    } else if (commentToReplyTo) {
        setReplyingTo(commentToReplyTo);
    } else if (initialText) {
        commentInputRef.current?.focus();
    }
  }, [replyingTo, commentToReplyTo, initialText]);
  
  useEffect(() => {
    if (lastCommand === 'intent_post_comment' && newCommentText.trim()) {
      handlePostCommentSubmit({ preventDefault: () => {} } as React.FormEvent).then(() => {
          onCommandProcessed();
      });
    }
  }, [lastCommand, newCommentText, onCommandProcessed, handlePostCommentSubmit]);


  const commentsToDisplay = useMemo(() => {
    if (!post?.comments) return [];
    const imageCount = post.imageDetails?.length ?? (post.imageUrl || post.newPhotoUrl ? 1 : 0);
    if (imageCount > 1) {
      // For multi-image posts, only show general comments in the sheet.
      return post.comments.filter(c => c && !c.imageId);
    }
    // For single-image or no-image posts, show all comments.
    return post.comments.filter(c => c);
  }, [post]);

  const generalCommentCount = useMemo(() => commentsToDisplay.length, [commentsToDisplay]);

  const commentThreads = useMemo(() => {
    if (!commentsToDisplay) return [];
    const comments = [...commentsToDisplay].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
  }, [commentsToDisplay]);

  const handlePlayComment = useCallback((comment: Comment) => {
    if (comment.type !== 'audio') return;
    setPlayingCommentId(prev => prev === comment.id ? null : comment.id);
  }, []);
  
  const handleMarkBestAnswer = async (commentId: string) => {
    if (!post || post.author.id !== currentUser.id) return;
    const updatedPost = await geminiService.markBestAnswer(currentUser.id, post.id, commentId);
    if (updatedPost) {
        // onSetTtsMessage is not passed as a prop, but if it were, this would work.
        // For now, the optimistic update from the listener will handle UI change.
        // onSetTtsMessage("Best answer marked!");
    }
  };

  const CommentWithReplies: React.FC<{ comment: Comment & { replies: Comment[] }, isReply?: boolean }> = ({ comment, isReply = false }) => (
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
        {comment.replies?.length > 0 && (
            <div className="ml-6 pl-4 border-l-2 border-slate-700 space-y-3">
                {comment.replies.map(reply => (
                    <CommentWithReplies key={reply.id} comment={reply as Comment & { replies: Comment[] }} isReply={true} />
                ))}
            </div>
        )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-end animate-fade-in-fast" onClick={handleClose}>
      <div 
        className={`bg-slate-900 w-full max-w-2xl h-[85vh] md:h-[90vh] rounded-t-2xl flex flex-col ${isClosing ? 'animate-slide-out-to-bottom' : 'animate-slide-in-from-bottom'}`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 p-4 border-b border-slate-700/50 flex items-center justify-center relative">
            <div className="w-10 h-1.5 bg-slate-700 rounded-full absolute top-2"></div>
            <h2 className="text-xl font-bold text-slate-100">Comments ({generalCommentCount})</h2>
            <button onClick={handleClose} className="absolute top-2 right-3 p-2 rounded-full text-slate-400 hover:bg-slate-800">
                <Icon name="close" className="w-6 h-6" />
            </button>
        </header>
        
        <div className="flex-grow overflow-y-auto">
            {post ? (
                <div className="flex flex-col gap-6 p-4">
                    <div className="border-b border-slate-700/50 pb-4">
                        <PostCard
                            post={post}
                            currentUser={currentUser}
                            isActive={true}
                            isPlaying={isPlaying}
                            onPlayPause={() => setIsPlaying(p => !p)}
                            onReact={onReactToPost}
                            onOpenComments={() => {}} // Already open
                            onAuthorClick={onOpenProfile}
                            onSharePost={onSharePost}
                            onOpenPhotoViewer={onOpenPhotoViewer}
                            onDeletePost={onDeletePost}
                            onReportPost={onReportPost}
                            isSaved={currentUser.savedPostIds?.includes(post.id)}
                            onSavePost={(post, isSaving) => { /* handle save if needed */ }}
                            onCopyLink={(post) => { /* handle copy if needed */ }}
                            onHidePost={(postId) => { /* handle hide if needed */ }}
                        />
                    </div>
                    
                    <div className="flex flex-col gap-4">
                        {commentThreads.length > 0 ? commentThreads.map(comment => (
                            <CommentWithReplies key={comment.id} comment={comment} />
                        )) : (
                            <p className="text-slate-400 text-center py-4">Be the first to comment.</p>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-center p-8 text-slate-400">Loading post...</p>
            )}
        </div>

        <footer className="flex-shrink-0 p-3 border-t border-slate-700 bg-slate-800/50">
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
                    autoFocus={!!commentToReplyTo || !!initialText}
                />
                 <button type="submit" className="p-2.5 rounded-full bg-fuchsia-600 text-white hover:bg-fuchsia-500 disabled:bg-slate-500" disabled={!newCommentText.trim() || isPostingComment}>
                    <Icon name="paper-airplane" className="w-5 h-5" />
                 </button>
            </form>
        </footer>
      </div>
    </div>
  );
};

export default CommentSheet;