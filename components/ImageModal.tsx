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
// FIX: Added missing context object to `geminiService.processIntent` call.
            const intentResponse = await geminiService.processIntent(lastCommand