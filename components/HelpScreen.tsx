import React from 'react';
import Icon from './Icon';

interface HelpScreenProps {
  onGoBack: () => void;
}

const CommandCategory: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-8">
        <h2 className="text-2xl font-bold text-fuchsia-300 mb-4 border-b-2 border-fuchsia-500/30 pb-2">{title}</h2>
        <div className="space-y-3">{children}</div>
    </div>
);

const CommandItem: React.FC<{ command: string, description: string }> = ({ command, description }) => (
    <div className="bg-slate-800/60 p-4 rounded-lg">
        <p className="font-mono text-lg text-white">" {command} "</p>
        <p className="text-slate-400 mt-1 text-sm">{description}</p>
    </div>
);

const HelpScreen: React.FC<HelpScreenProps> = ({ onGoBack }) => {
    return (
        <div className="h-full w-full overflow-y-auto text-white p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                     <button onClick={onGoBack} className="p-2 -ml-2 rounded-full text-fuchsia-400 hover:bg-slate-800 md:hidden">
                        <Icon name="back" className="w-6 h-6" />
                    </button>
                    <h1 className="text-4xl font-bold">Command List</h1>
                </div>
                
                <p className="text-slate-300 mb-8 text-lg">
                    Here are some example commands you can use. You can speak in English, Bengali, or a mix (Banglish). The AI is flexible!
                </p>

                <CommandCategory title="General Navigation">
                    <CommandItem command="Go to my feed / হোম পেজে যাও" description="Navigates to the main feed screen." />
                    <CommandItem command="Open explore / এক্সপ্লোর" description="Goes to the explore page to discover new content." />
                    <CommandItem command="Open reels / রিলস দেখাও" description="Opens the vertical video reels feed." />
                    <CommandItem command="Show my profile / আমার প্রোফাইল" description="Opens your personal profile page." />
                    <CommandItem command="Open [Friend's Name]'s profile" description="Example: 'Open Shojib Khan's profile'." />
                    <CommandItem command="Open messages / মেসেজ দেখাও" description="Goes to your conversations screen." />
                    <CommandItem command="Open groups / গ্রুপ পেজ" description="Navigates to the main groups hub." />
                    <CommandItem command="Open rooms / রুম পেজ" description="Navigates to the live rooms hub." />
                    <CommandItem command="Show my saved posts / সেভ করা পোস্ট" description="Opens the list of posts you have saved." />
                    <CommandItem command="Go back / ফিরে যাও" description="Navigates to the previous screen." />
                    <CommandItem command="Reload page / রিলোড কর" description="Refreshes the content on the current page." />
                    <CommandItem command="Logout / লগ আউট কর" description="Signs you out of your account." />
                </CommandCategory>
                
                <CommandCategory title="Feed & Content Interaction">
                    <CommandItem command="Play post / প্লে কর" description="Plays the audio or video of the current post on screen." />
                    <CommandItem command="Pause post / পজ কর" description="Pauses the currently playing audio or video." />
                    <CommandItem command="Next post / পরের পোস্টে যাও" description="Scrolls to and focuses on the next post in the feed." />
                    <CommandItem command="Previous post / আগের পোস্টে যাও" description="Scrolls to the previous post." />
                    <CommandItem command="Scroll down / নিচে যাও" description="Starts scrolling the page down continuously." />
                    <CommandItem command="Scroll up / উপরে যাও" description="Starts scrolling the page up continuously." />
                    <CommandItem command="Stop scroll / থামো" description="Stops the continuous scroll." />
                    <CommandItem command="like this post / love dao / haha" description="Reacts to the current post. You can say 'like', 'love', 'haha', 'sad', 'wow', 'angry', or their Bengali equivalents (e.g., 'bhalobasha')." />
                    <CommandItem command="Like [Friend's Name]'s post" description="Finds a visible post by the specified friend and reacts to it." />
                    <CommandItem command="comment on this post [your comment]" description="Adds a text comment directly. Example: 'comment on this post khub sundor'." />
                    <CommandItem command="Open comments / কমেন্টগুলো দেখাও" description="Opens the full comment sheet for the current post." />
                    <CommandItem command="post comment / কমেন্ট পোস্ট কর" description="Publishes the comment you have written in the comment sheet." />
                    <CommandItem command="open this post / পোস্ট-টি খোল" description="Opens the images of the current post in a full-screen viewer." />
                    <CommandItem command="next image / পরের ছবি" description="While viewing images, this shows the next one." />
                    <CommandItem command="previous image / আগের ছবি" description="While viewing images, this shows the previous one." />
                    <CommandItem command="comment on this image [your comment]" description="While viewing a specific image, you can add a comment to it. Example: 'comment on this image sundor'." />
                    <CommandItem command="Share this post / শেয়ার কর" description="Opens the sharing options for the current post." />
                    <CommandItem command="Save this post / পোস্ট সেভ কর" description="Saves the current post to your 'Saved' list." />
                    <CommandItem command="Unsave this post / আনসেভ কর" description="Removes the current post from your saved list." />
                    <CommandItem command="Hide this post / পোস্ট লুকাও" description="Hides the current post from your feed for this session." />
                    <CommandItem command="Copy link / লিঙ্ক কপি কর" description="Copies the direct link of the current post to your clipboard." />
                    <CommandItem command="Report post / রিপোর্ট কর" description="Opens the report dialog for the current post." />
                    <CommandItem command="Delete this post / পোস্ট ডিলিট কর" description="Deletes your own post." />
                </CommandCategory>

                <CommandCategory title="Creating Content">
                    <CommandItem command="Create a new post / নতুন পোস্ট" description="Opens the screen to create a new post." />
                    <CommandItem command="Start a voice post / ভয়েস পোস্ট" description="Starts recording a new voice post immediately." />
                    <CommandItem command="Stop recording / রেকর্ডিং বন্ধ কর" description="Stops an ongoing voice recording for a post or comment." />
                    <CommandItem command="Re-record / আবার রেকর্ড কর" description="Discards the current recording and starts a new one." />
                    <CommandItem command="Post it / পোস্ট কর" description="Confirms and publishes your created post or comment." />
                    <CommandItem command="Generate an image of [prompt]" description="Uses AI to create an image. Example: 'Generate an image of a cat on a skateboard'." />
                    <CommandItem command="Create a poll" description="Opens the poll creation interface in the post composer." />
                </CommandCategory>
                
                <CommandCategory title="Stories">
                    <CommandItem command="Create a story / স্টোরি বানাও" description="Opens the story creation screen." />
                    <CommandItem command="Add text [your text] to story" description="Adds or replaces the text on a text story." />
                    <CommandItem command="Add music / গান অ্যাড কর" description="Opens the music library for your story." />
                    <CommandItem command="Set story privacy to friends" description="Changes who can see your story ('public' or 'friends')." />
                    <CommandItem command="Post story / স্টোরি পোস্ট কর" description="Publishes your created story." />
                    <CommandItem command="Next story / পরের স্টোরি" description="Moves to the next story in the sequence." />
                    <CommandItem command="Reply to this story [your reply]" description="Sends a reply to the story you are viewing." />
                    <CommandItem command="Delete my story" description="Deletes the story you created." />
                    <CommandItem command="Mute [Name]'s stories" description="Hides future stories from a specific user." />
                </CommandCategory>
                
                <CommandCategory title="Messaging & Calls">
                    <CommandItem command="Open chat with [Name]" description="Opens a direct message conversation with a friend." />
                    <CommandItem command="Send message [your message]" description="Sends a text message in the open chat. Example: 'send message I am on my way'." />
                    <CommandItem command="Record a voice message" description="Starts recording a voice message in the current chat." />
                    <CommandItem command="React to the last message with a heart" description="Adds a reaction to the last message in the chat." />
                    <CommandItem command="Unsend my last message" description="Deletes the last message you sent." />
                    <CommandItem command="Start an audio call with [Name]" description="Initiates a voice call with a friend." />
                    <CommandItem command="Start a video call with [Name]" description="Initiates a video call with a friend." />
                    <CommandItem command="Change theme to [Theme Name]" description="Changes the current chat's theme (e.g., 'aurora', 'cyberpunk')." />
                    <CommandItem command="Pin this chat" description="Pins the current conversation to the top of your list." />
                    <CommandItem command="Archive this chat" description="Moves the current conversation to the archive." />
                </CommandCategory>

                 <CommandCategory title="Friends & Social">
                    <CommandItem command="Show my friends / আমার বন্ধুদের দেখাও" description="Navigates to your friends list." />
                    <CommandItem command="Show friend requests" description="Goes to the friend requests tab." />
                    <CommandItem command="Add [Name] as friend" description="Sends a friend request to the specified user on their profile." />
                    <CommandItem command="Accept [Name]'s request" description="Accepts a pending friend request from a user." />
                    <CommandItem command="Decline [Name]'s request" description="Declines a pending friend request." />
                    <CommandItem command="Unfriend [Name]" description="Removes a user from your friends list (from their profile)." />
                    <CommandItem command="Cancel request to [Name]" description="Cancels a friend request you sent." />
                    <CommandItem command="Search for [Name]" description="Searches for a user on VoiceBook." />
                </CommandCategory>
                
                <CommandCategory title="Groups">
                    <CommandItem command="Create a group called [Name]" description="Starts the group creation process with a pre-filled name." />
                    <CommandItem command="Search for [topic] groups" description="Searches for groups matching a topic." />
                    <CommandItem command="Show me [Category] groups" description="Filters the group list by a category (e.g., 'Gaming', 'Food')." />
                    <CommandItem command="Open [Group Name]" description="Navigates directly to a group you are a member of." />
                    <CommandItem command="Join group" description="Joins the public group you are currently viewing." />
                    <CommandItem command="Leave group" description="Leaves the group you are currently viewing." />
                    <CommandItem command="Open group chat / চ্যাট" description="Opens the chat room for the current group." />
                    <CommandItem command="View group events / ইভেন্ট" description="Opens the events page for the current group." />
                    <CommandItem command="Manage group" description="Opens the management panel if you are an admin." />
                </CommandCategory>

                <CommandCategory title="Live Rooms (Audio & Video)">
                    <CommandItem command="Start an audio room" description="Creates a new live audio room where you are the host." />
                    <CommandItem command="Start a video room" description="Creates a new live video room." />
                    <CommandItem command="Raise hand" description="In an audio room, signals that you want to speak." />
                    <CommandItem command="Mute myself" description="Mutes your microphone in a room or call." />
                    <CommandItem command="Invite [Name] to the room" description="As a host, invites a listener to become a speaker." />
                </CommandCategory>

                 <CommandCategory title="Settings & Profile">
                    <CommandItem command="Open settings / সেটিংসে যাও" description="Navigates to the main settings page." />
                    <CommandItem command="Change my name to [New Name]" description="Updates your name in the settings form." />
                    <CommandItem command="Set my bio to [New Bio]" description="Updates your bio in the settings form." />
                    <CommandItem command="Set post visibility to friends" description="Changes your default post privacy ('public' or 'friends')." />
                    <CommandItem command="Turn off like notifications" description="Toggles a notification setting ('on' or 'off')." />
                    <CommandItem command="Unblock [Name]" description="Unblocks a user from the settings page." />
                    <CommandItem command="Change password" description="Opens the change password dialog." />
                    <CommandItem command="Deactivate my account" description="Initiates the account deactivation process." />
                    <CommandItem command="Save settings" description="Saves all changes made on the settings page." />
                </CommandCategory>

            </div>
        </div>
    );
};

export default HelpScreen;
