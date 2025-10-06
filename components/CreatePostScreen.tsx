import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RecordingState, User, Post, PostImageLayout } from '../types';
import { getTtsPrompt } from '../constants';
import Icon from './Icon';
import { geminiService } from '../services/geminiService';
import { firebaseService } from '../services/firebaseService';
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
}

const FEELINGS = [
    { emoji: '😄', text: 'happy' }, { emoji: '😇', text: 'blessed' }, { emoji: '🥰', text: 'loved' },
    { emoji: '😢', text: 'sad' }, { emoji: '😠', text: 'angry' }, { emoji: '🤔', text: 'thinking' },
    { emoji: '🤪', text: 'crazy' }, { emoji: '🥳', text: 'celebrating' }, { emoji: '😎', text: 'cool' },
    { emoji: '😴', text: 'tired' }, { emoji: '🤩', text: 'excited' }, { emoji: '🙏', text: 'thankful' }
];

const EMOJI_PICKER_LIST = [
  '😀', '😂', '😍', '❤️', '👍', '🙏', '😭', '😮', '🤔', '🥳', '😎', '😢', '😠', '🎉', '🔥'
];

type SubView = 'main' | 'feelings'; 
type Feeling = { emoji: string; text: string };

const LAYOUTS: { name: PostImageLayout, icon: React.ReactNode }[] = [
    { name: 'grid', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M4 4h6v6H4zm8 0h6v6h-6zM4 14h6v6H4zm8 0h6v6h-6z"/></svg> },
    { name: 'masonry', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M4 4h6v10H4zm8 0h6v6h-6zM4 18h6v2H4zm8-8h6v10h-6z" /></svg> },
    { name: 'hexagon', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 2l8 4.5v9l-8 4.5-8-4.5v-9L12 2zm0 2.31L5.5 8v6l6.5 3.69L18.5 14V8L12 4.31z"/></svg> },
    { name: 'spotlight', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 20a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 00-1-1H4a1 1 0 00-1 1v2zm14 0a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2z" /></svg> },
    { name: 'timeline', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M4 11h16v2H4zm-2-7h2v14H2zm20 0h2v14h-2z" /></svg> },
];


const CreatePostScreen: React.FC<CreatePostScreenProps> = ({ currentUser, onPostCreated, onSetTtsMessage, lastCommand, onDeductCoinsForImage, onCommandProcessed, onGoBack, groupId, groupName, startRecording, selectMedia }) => {
    const [caption, setCaption] = useState('');
    const [feeling, setFeeling] = useState<Feeling | null>(null);
    const [subView, setSubView] = useState<SubView>('main');
    const [isPosting, setIsPosting] = useState(false);
    const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
    
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const [mediaPreviewUrls, setMediaPreviewUrls] = useState<string[]>([]);
    const [imageCaptions, setImageCaptions] = useState<string[]>([]);
    const [selectedLayout, setSelectedLayout] = useState<PostImageLayout>('grid');

    const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
    const [duration, setDuration] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { language } = useSettings();

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);
    
    const clearAudioRecording = useCallback(() => {
        stopTimer();
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }
        setRecordingState(RecordingState.IDLE);
        setDuration(0);
    }, [audioUrl, stopTimer]);
    
    const clearMediaFiles = useCallback(() => {
        mediaPreviewUrls.forEach(URL.revokeObjectURL);
        setMediaFiles([]);
        setMediaPreviewUrls([]);
        setImageCaptions([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [mediaPreviewUrls]);


    const startTimer = useCallback(() => {
        stopTimer();
        setDuration(0);
        timerRef.current = setInterval(() => {
            setDuration(d => d + 1);
        }, 1000);
    }, [stopTimer]);
    
    const handleStartRecording = useCallback(async () => {
        clearMediaFiles();
        
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
        setRecordingState(RecordingState.IDLE);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const newAudioUrl = URL.createObjectURL(audioBlob);
                setAudioUrl(newAudioUrl);
                stream.getTracks().forEach(track => track.stop());
                onSetTtsMessage(getTtsPrompt('record_stopped', language, { duration }));
            };
            recorder.start();
            setRecordingState(RecordingState.RECORDING);
            onSetTtsMessage(getTtsPrompt('record_start', language));
            startTimer();
        } catch (err: any) {
            console.error("Mic permission error:", err);
            onSetTtsMessage(getTtsPrompt('error_mic_permission', language));
        }
    }, [audioUrl, clearMediaFiles, onSetTtsMessage, startTimer, duration, language]);

    const handleStopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            stopTimer();
            setRecordingState(RecordingState.PREVIEW);
        }
    }, [stopTimer]);

    useEffect(() => {
        if (startRecording) {
            handleStartRecording();
        } else if (selectMedia === 'image' || selectMedia === 'video') {
            fileInputRef.current?.click();
        } else {
            onSetTtsMessage(`What's on your mind, ${currentUser.name.split(' ')[0]}?`);
        }
    }, [startRecording, selectMedia, currentUser.name, onSetTtsMessage, handleStartRecording]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setEmojiPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            clearAudioRecording();
            const newFiles = Array.from(files);
            const newUrls = newFiles.map((file: File) => URL.createObjectURL(file));
            mediaPreviewUrls.forEach(URL.revokeObjectURL);
            setMediaFiles(newFiles);
            setMediaPreviewUrls(newUrls);
            setImageCaptions(new Array(newFiles.length).fill(''));
        }
    };
    
    const handleImageCaptionChange = (index: number, value: string) => {
        const newCaptions = [...imageCaptions];
        newCaptions[index] = value;
        setImageCaptions(newCaptions);
    };

    const handlePost = useCallback(async () => {
        const hasMedia = mediaFiles.length > 0;
        const hasAudio = recordingState === RecordingState.PREVIEW && audioUrl;
        const hasContent = caption.trim() || hasMedia || feeling || hasAudio;

        if (isPosting || !hasContent) return;
        
        setIsPosting(true);
        if (hasAudio) setRecordingState(RecordingState.UPLOADING);
        onSetTtsMessage("Publishing your post...");

        try {
            const postBaseData: any = {
                author: currentUser,
                caption: caption,
                status: groupId ? 'pending' : 'approved',
                feeling: feeling,
                groupId,
                groupName,
                duration: hasAudio ? duration : 0,
                imageLayout: hasMedia ? selectedLayout : undefined,
                imageCaptions: hasMedia ? imageCaptions : undefined,
            };
            
            await firebaseService.createPost(
                postBaseData, 
                { 
                    mediaFiles: mediaFiles,
                    audioBlobUrl: audioUrl
                }
            );

            if (postBaseData.status === 'pending') {
                onSetTtsMessage(getTtsPrompt('post_pending_approval', language));
                setTimeout(() => onGoBack(), 1500); 
            } else {
                onPostCreated(null);
            }
        } catch (error: any) {
            console.error("Failed to create post:", error);
            onSetTtsMessage(`Failed to create post: ${error.message}`);
            setIsPosting(false);
            if(hasAudio) setRecordingState(RecordingState.PREVIEW);
        }
    }, [isPosting, caption, currentUser, onSetTtsMessage, onPostCreated, onGoBack, groupId, groupName, feeling, language, recordingState, audioUrl, duration, mediaFiles, selectedLayout, imageCaptions]);

    const handleFeelingSelect = (selected: Feeling) => {
        setFeeling(selected);
        setSubView('main');
    };
    
    const renderMainView = () => (
        <>
            <div className="flex-grow flex flex-col min-h-0">
                <div className="flex-shrink-0 p-4">
                    <div className="flex items-center gap-3">
                        <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-12 h-12 rounded-full" />
                        <div>
                            <p className="font-bold text-slate-100 text-lg">
                                {currentUser.name}
                                {feeling && <span className="font-normal text-slate-400"> is feeling {feeling.emoji} {feeling.text}</span>}
                            </p>
                            <p className="text-sm text-slate-400">Public</p>
                        </div>
                    </div>
                    <div className="relative">
                        <textarea
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            placeholder={`What's on your mind, ${currentUser.name.split(' ')[0]}?`}
                            className="w-full bg-transparent text-slate-200 text-xl my-4 focus:outline-none resize-none"
                            rows={3}
                        />
                        <div className="absolute bottom-4 right-0" ref={emojiPickerRef}>
                            <button onClick={() => setEmojiPickerOpen(p => !p)} className="p-2 text-slate-400 hover:text-slate-200">
                                <Icon name="face-smile" className="w-6 h-6" />
                            </button>
                            {isEmojiPickerOpen && (
                                <div className="absolute bottom-full right-0 mb-2 w-64 bg-slate-900 border border-slate-700 p-2 rounded-lg grid grid-cols-5 gap-2 z-50 shadow-2xl">
                                    {EMOJI_PICKER_LIST.map(emoji => (
                                        <button key={emoji} onClick={() => setCaption(c => c + emoji)} className="text-2xl p-1 rounded-md hover:bg-slate-700 aspect-square flex items-center justify-center">{emoji}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto px-4 space-y-4">
                    {mediaPreviewUrls.length > 0 && (
                        <div className="relative group pb-4 space-y-3">
                             {mediaPreviewUrls.map((url, index) => (
                                <div key={url} className="flex gap-2 items-start">
                                    <img src={url} alt={`Post preview ${index + 1}`} className="w-24 h-24 rounded-lg object-cover flex-shrink-0" />
                                    <textarea
                                        value={imageCaptions[index]}
                                        onChange={(e) => handleImageCaptionChange(index, e.target.value)}
                                        placeholder={`Caption for image ${index + 1}...`}
                                        rows={3}
                                        className="w-full bg-slate-700/50 border-slate-600 rounded-lg p-2 text-sm resize-none focus:ring-rose-500 focus:border-rose-500"
                                    />
                                </div>
                             ))}
                            <button onClick={clearMediaFiles} className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white text-xs">
                                Clear All
                            </button>
                        </div>
                    )}

                    {recordingState !== RecordingState.IDLE && (
                         <div className="w-full flex flex-col items-center justify-center p-4 min-h-[150px] bg-slate-700/40 rounded-lg">
                            {recordingState === RecordingState.RECORDING && (
                                <>
                                    <p className="text-sm text-rose-400 mb-2">Recording...</p>
                                    <div className="w-full h-16">
                                        <Waveform isPlaying={false} isRecording={true}/>
                                    </div>
                                    <p className="text-xl font-mono mt-2">00:{duration.toString().padStart(2, '0')}</p>
                                    <button onClick={handleStopRecording} className="mt-4 p-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white">
                                        <Icon name="pause" className="w-5 h-5" />
                                    </button>
                                </>
                            )}
                            {recordingState === RecordingState.PREVIEW && audioUrl && (
                                <div className="text-center w-full space-y-3">
                                    <audio src={audioUrl} controls className="w-full h-10" />
                                    <div className="flex justify-center gap-4">
                                        <button onClick={clearAudioRecording} className="px-4 py-2 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors">Delete</button>
                                        <button onClick={handleStartRecording} className="px-4 py-2 text-sm rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-colors">Re-record</button>
                                    </div>
                                </div>
                            )}
                         </div>
                    )}
                    {mediaFiles.length > 1 && (
                        <div className="space-y-2">
                            <h3 className="font-semibold text-slate-300">Choose Layout</h3>
                            <div className="flex gap-2 p-1 bg-slate-900/50 rounded-lg overflow-x-auto">
                                {LAYOUTS.map(layout => (
                                    <button key={layout.name} onClick={() => setSelectedLayout(layout.name as PostImageLayout)} className={`p-2 rounded-md transition-colors ${selectedLayout === layout.name ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                        <div className="flex flex-col items-center gap-1">
                                            {layout.icon}
                                            <span className="text-xs capitalize">{layout.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <footer className="flex-shrink-0 p-4 space-y-4">
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" multiple className="hidden" />
                <div className="border border-slate-700 rounded-lg p-3 flex items-center justify-around">
                     <button onClick={handleStartRecording} className="flex items-center gap-2 text-rose-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="mic" className="w-6 h-6"/> Voice</button>
                     <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-green-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="photo" className="w-6 h-6"/> Photo/Video</button>
                     <button onClick={() => setSubView('feelings')} className="flex items-center gap-2 text-yellow-400 font-semibold p-2 rounded-md hover:bg-slate-700/50"><Icon name="face-smile" className="w-6 h-6"/> Feeling</button>
                </div>

                <button onClick={handlePost} disabled={isPosting || (!caption.trim() && mediaFiles.length === 0 && !feeling && recordingState !== RecordingState.PREVIEW)} className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-bold py-3 rounded-lg text-lg">
                    {isPosting ? 'Posting...' : 'Post'}
                </button>
            </footer>
        </>
    );
    
    const renderFeelingsView = () => {
         const filteredFeelings = FEELINGS;

        return (
            <div className={`w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh]`}>
                <header className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-center relative">
                    <button onClick={() => setSubView('main')} className="absolute top-1/2 -translate-y-1/2 left-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-full">
                        <Icon name="back" className="w-5 h-5 text-slate-300" />
                    </button>
                    <h2 className="text-xl font-bold text-slate-100">How are you feeling?</h2>
                </header>
                <main className="flex-grow p-4 pt-0 overflow-y-auto grid grid-cols-2 gap-2">
                    {filteredFeelings.map(f => (
                        <button key={f.text} onClick={() => handleFeelingSelect(f)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50">
                            <span className="text-3xl">{f.emoji}</span>
                            <span className="font-semibold capitalize text-slate-200">{f.text}</span>
                        </button>
                    ))}
                </main>
            </div>
        )
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onGoBack}>
            <div onClick={e => e.stopPropagation()}>
                {subView === 'feelings' ? renderFeelingsView() : (
                    <div className={`w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto`}>
                         <header className="flex-shrink-0 p-4 border-b border-slate-700 flex items-center justify-center relative">
                            <h2 className="text-xl font-bold text-slate-100">Create post</h2>
                            <button onClick={onGoBack} className="absolute top-1/2 -translate-y-1/2 right-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-full">
                                <Icon name="close" className="w-5 h-5 text-slate-300" />
                            </button>
                        </header>
                        {renderMainView()}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreatePostScreen;