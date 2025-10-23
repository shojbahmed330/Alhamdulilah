import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RecordingState, User, Post, PostImageLayout } from '../types';
import { getTtsPrompt, IMAGE_GENERATION_COST } from '../constants';
import Icon from './Icon';
import { geminiService } from '../services/geminiService';
import { useSettings } from '../contexts/SettingsContext';
import Waveform from './Waveform';

interface CreatePostScreenProps {
  currentUser: User;
  onPostCreated: (newPost: Post | null) => void;
  onSetTtsMessage: (message: string) => void;
  lastCommand: string | null;
  onDeductCoinsForImage: () => Promise<boolean>;
  onCommandProcessed: () => void;
  onGoBack: () => void;
  groupId?: string;
  groupName?: string;
  startRecording?: boolean;
  selectMedia?: 'image' | 'video';
  imagePrompt?: string;
  createPoll?: boolean;
}

const FEELINGS = [
    { emoji: '😄', text: 'happy' }, { emoji: '😇', text: 'blessed' }, { emoji: '🥰', text: 'loved' },
    { emoji: '😢', text: 'sad' }, { emoji: '😠', text: 'angry' }, { emoji: '🤔', text: 'thinking' },
    { emoji: '🤪', text: 'crazy' }, { emoji: '🥳', text: 'celebrating' }, { emoji: '😎', text: 'cool' },
    { emoji: '😴', text: 'tired' }, { emoji: '🤩', text: 'excited' }, { emoji: '🙏', text: 'thankful' }
];

const EMOJI_PICKER_LIST = [
  '😀', '😂', '😍', '❤️', '👍', '🙏', '😭', '😮', '🤔', '🎉', '😢', '😠', '🔥', '💯', '🤯', '😎'
];

const CreatePostScreen: React.FC<CreatePostScreenProps> = ({ 
    currentUser, onPostCreated, onSetTtsMessage, lastCommand, onDeductCoinsForImage, 
    onCommandProcessed, onGoBack, groupId, groupName, startRecording, selectMedia, 
    imagePrompt: initialImagePrompt, createPoll 
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [duration, setDuration] = useState(0);
  const [caption, setCaption] = useState('');
  
  const [imagePrompt, setImagePrompt] = useState(initialImagePrompt || '');
  const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [editedImageBase64, setEditedImageBase64] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');

  const [showPollCreator, setShowPollCreator] = useState(createPoll || false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [imageCaptions, setImageCaptions] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [imageLayout, setImageLayout] = useState<PostImageLayout>('grid');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isPosting, setIsPosting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { language } = useSettings();
  const [feeling, setFeeling] = useState<{emoji: string, text: string} | null>(null);


  const clearOtherInputs = (except?: 'media' | 'audio' | 'ai' | 'poll') => {
    if (except !== 'ai') {
        setGeneratedImageBase64(null);
        setEditedImageBase64(null);
        setImagePrompt('');
    }
    if (except !== 'poll') {
        setShowPollCreator(false);
        setPollQuestion('');
        setPollOptions(['', '']);
    }
    if (except !== 'media') {
        setMediaFiles([]);
        mediaPreviews.forEach(url => URL.revokeObjectURL(url));
        setMediaPreviews([]);
        setMediaType(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }
    if (except !== 'audio') {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
        setRecordingState(RecordingState.IDLE);
        setDuration(0);
    }
  };
  
  const handleStartRecording = async () => { /* ... implementation from original file ... */ };
  const handleStopRecording = () => { /* ... implementation from original file ... */ };

  const handleFileSelectClick = (type: 'image' | 'video') => {
    clearOtherInputs();
    if (fileInputRef.current) {
        fileInputRef.current.accept = type === 'image' ? 'image/*' : 'video/*';
        fileInputRef.current.multiple = type === 'image';
        fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
        const firstFile = files[0];
// FIX: Add a guard clause to ensure 'firstFile' is not undefined before accessing its properties.
        if (firstFile) {
            clearOtherInputs('media');
// FIX: 'type' does not exist on type 'unknown'. Added guard clause above.
            setMediaType(firstFile.type.startsWith('video') ? 'video' : 'image');
            setMediaFiles(files);
// FIX: 'file' is of type 'unknown'. Added guard clause above.
            setMediaPreviews(files.map(file => URL.createObjectURL(file)));
            setImageCaptions(Array(files.length).fill(''));
        }
    }
  };

  const handleGenerateImage = useCallback(async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;

    const paymentSuccess = await onDeductCoinsForImage();
    if (!paymentSuccess) return;
    
    clearOtherInputs('ai');
    setIsGeneratingImage(true);
    onSetTtsMessage("Generating your masterpiece...");

// FIX: 'generateImageForPost' does not exist on type 'geminiService'. This method was missing from the service definition and has been added.
    const base64DataUrl = await geminiService.generateImageForPost(imagePrompt);
    setIsGeneratingImage(false);
    
    if(base64DataUrl) {
        setGeneratedImageBase64(base64DataUrl);
        onSetTtsMessage(`Image generated! You can now add a caption or edit it.`);
    } else {
        onSetTtsMessage(`Sorry, I couldn't generate an image for that prompt.`);
    }
  }, [imagePrompt, isGeneratingImage, onSetTtsMessage, onDeductCoinsForImage]);

  const handlePost = useCallback(async () => {
    const hasContent = caption.trim() || audioUrl || generatedImageBase64 || mediaFiles.length > 0 || showPollCreator;
    if (isPosting || !hasContent) return;
    
    setIsPosting(true);
    onSetTtsMessage("Publishing your post...");

    try {
        const finalImageBase64 = editedImageBase64 || generatedImageBase64;
        const postBaseData: Partial<Post> = {
            author: currentUser as any,
            caption,
            duration: audioUrl ? duration : 0,
            groupId,
            groupName,
            status: groupId ? 'pending' : 'approved',
            imagePrompt: finalImageBase64 ? imagePrompt : undefined,
            imageLayout: mediaFiles.length > 1 ? imageLayout : undefined,
            feeling: feeling || undefined,
        };
        
        if (showPollCreator && pollQuestion.trim() && pollOptions.every(o => o.trim())) {
            postBaseData.poll = {
                question: pollQuestion,
                options: pollOptions.filter(Boolean).map(text => ({ text, votes: 0, votedBy: [] }))
            };
        }

        const newPost = await geminiService.createPost(postBaseData, {
            mediaFiles: mediaFiles,
            imageCaptions: imageCaptions,
            audioBlobUrl: audioUrl,
            generatedImageBase64: finalImageBase64,
        });

        if (newPost) {
            onPostCreated(newPost);
        } else {
            throw new Error("Post creation failed.");
        }
    } catch (error) {
        console.error("Failed to create post:", error);
        onSetTtsMessage(`Failed to create post.`);
        setIsPosting(false);
    }
  }, [caption, audioUrl, generatedImageBase64, mediaFiles, showPollCreator, pollQuestion, pollOptions, isPosting, currentUser, duration, groupId, groupName, imagePrompt, imageLayout, editedImageBase64, imageCaptions, feeling, onSetTtsMessage, onPostCreated]);
  
  useEffect(() => {
    if(initialImagePrompt) handleGenerateImage();
    if(selectMedia) handleFileSelectClick(selectMedia);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-slate-100 p-4 sm:p-8">
      <div className="w-full max-w-lg bg-slate-800 rounded-2xl p-6 flex flex-col gap-6">
        <h2 className="text-3xl font-bold">Create Post</h2>
        
        <div className="flex items-start gap-4">
             <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-12 h-12 rounded-full mt-2" />
             <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={`What's on your mind, ${currentUser.name.split(' ')[0]}?`}
                className="flex-grow bg-transparent text-slate-100 text-lg rounded-lg focus:ring-0 focus:outline-none min-h-[100px] resize-none"
                rows={3}
             />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-around items-center border-y border-slate-700 py-2">
            <button onClick={handleStartRecording} disabled={mediaFiles.length > 0} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40">
                <Icon name="mic" className="w-6 h-6 text-rose-500"/> <span className="font-semibold text-slate-300">Voice</span>
            </button>
             <button onClick={() => handleFileSelectClick('image')} disabled={recordingState !== RecordingState.IDLE} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40">
                <Icon name="photo" className="w-6 h-6 text-green-400"/> <span className="font-semibold text-slate-300">Photo</span>
            </button>
             <button onClick={() => handleFileSelectClick('video')} disabled={recordingState !== RecordingState.IDLE} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40">
                <Icon name="video-camera" className="w-6 h-6 text-sky-400"/> <span className="font-semibold text-slate-300">Video</span>
            </button>
            <button onClick={() => { clearOtherInputs('poll'); setShowPollCreator(p => !p); }} disabled={mediaFiles.length > 0 || recordingState !== RecordingState.IDLE} className={`flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-40 ${showPollCreator ? 'bg-rose-500/20' : ''}`}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                 <span className="font-semibold text-slate-300">Poll</span>
            </button>
        </div>

        <button onClick={handlePost} disabled={isPosting} className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg">
            {isPosting ? 'Publishing...' : 'Post'}
        </button>
      </div>
    </div>
  );
};

export default CreatePostScreen;