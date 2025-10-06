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

                <CommandCategory title="Navigation">
                    <CommandItem command="Go to my feed / হোম পেজে যাও" description="Navigates to the main feed screen." />
                    <CommandItem command="Open explore / এক্সপ্লোর" description="Goes to the explore page to discover new content." />
                    <CommandItem command="Show my profile / আমার প্রোফাইল" description="Opens your personal profile page." />
                    <CommandItem command="Open [Friend's Name]'s profile" description="Example: 'Open Shojib Khan's profile'." />
                    <CommandItem command="Open groups / গ্রুপ পেজ" description="Navigates to the main groups hub." />
                    <CommandItem command="Open rooms / রুম পেজ" description="Navigates to the live rooms hub." />
                    <CommandItem command="Go back / ফিরে যাও" description="Navigates to the previous screen." />
                    <CommandItem command="Open messages / মেসেজ দেখাও" description="Goes to your conversations screen." />
                    <CommandItem command="Reload page / রিলোড কর" description="Refreshes the content on the current page." />
                </CommandCategory>
                
                <CommandCategory title="Feed & Content Interaction">
                    <CommandItem command="Play post / প্লে কর" description="Plays the audio or video of the current post." />
                    <CommandItem command="Pause post / পজ কর" description="Pauses the currently playing audio or video." />
                    <CommandItem command="Next post / পরের পোস্টে যাও" description="Scrolls to and focuses on the next post in the feed." />
                    <CommandItem command="Previous post / আগের পোস্টে যাও" description="Scrolls to the previous post." />
                    <CommandItem command="Scroll down / নিচে যাও" description="Starts scrolling the page down continuously." />
                    <CommandItem command="Scroll up / উপরে যাও" description="Starts scrolling the page up continuously." />
                    <CommandItem command="Stop scroll / থামো" description="Stops the continuous scroll." />
                    <CommandItem command="like this post / love dao / haha" description="Reacts to the current post. You can say 'like', 'love', 'haha', 'sad', 'wow', 'angry', or their Bengali equivalents (e.g., 'bhalobasha')." />
                    <CommandItem command="comment on this post [your comment]" description="Example: 'comment on this post khub sundor'." />
                    <CommandItem command="post comment / কমেন্ট পোস্ট কর" description="Publishes the comment you have written." />
                    <CommandItem command="open this post / পোস্ট-টি খোল" description="Opens the images of the current post in a full-screen viewer." />
                    <CommandItem command="next image / পরের ছবি" description="While viewing images, this shows the next one." />
                    <CommandItem command="previous image / আগের ছবি" description="While viewing images, this shows the previous one." />
                    <CommandItem command="comment on this image [your comment]" description="While viewing a specific image, you can add a comment to it. Example: 'comment on this image sundor'." />
                    <CommandItem command="Share this post / শেয়ার কর" description="Opens the sharing options for the current post." />
                    <CommandItem command="Save this post / পোস্ট সেভ কর" description="Saves the current post to your 'Saved' list." />
                    <CommandItem command="Hide this post / পোস্ট লুকাও" description="Hides the current post from your feed for this session." />
                    <CommandItem command="Copy link / লিঙ্ক কপি কর" description="Copies the direct link of the current post to your clipboard." />
                    <CommandItem command="Report post / রিপোর্ট কর" description="Opens the report dialog for the current post." />
                </CommandCategory>

                <CommandCategory title="Creating Content">
                    <CommandItem command="Create a new post / নতুন পোস্ট" description="Opens the screen to create a new post." />
                    <CommandItem command="Start a voice post / ভয়েস পোস্ট" description="Starts recording a new voice post immediately." />
                    <CommandItem command="Stop recording / রেকর্ডিং বন্ধ কর" description="Stops an ongoing voice recording." />
                    <CommandItem command="Re-record / আবার রেকর্ড কর" description="Discards the current recording and starts a new one." />
                    <CommandItem command="Post it / পোস্ট কর" description="Confirms and publishes your created post or comment." />
                    <CommandItem command="Generate an image of [prompt]" description="Example: 'Generate an image of a cat on a skateboard'." />
                    <CommandItem command="Create a poll" description="Opens the poll creation interface in the post composer." />
                    <CommandItem command="Create a story / স্টোরি বানাও" description="Opens the story creation screen." />
                    <CommandItem command="Add text [your text] to story" description="Adds or replaces the text on a text story." />
                    <CommandItem command="Add music / গান অ্যাড কর" description="Opens the music library for your story." />
                    <CommandItem command="Set story privacy to friends" description="Changes who can see your story ('public' or 'friends')." />
                    <CommandItem command="Post story / স্টোরি পোস্ট কর" description="Publishes your created story." />
                </CommandCategory>

                 <CommandCategory title="Friends & Social">
                    <CommandItem command="Show my friends / আমার বন্ধুদের দেখাও" description="Navigates to your friends list." />
                    <CommandItem command="Show friend requests" description="Goes to the friend requests tab." />
                    <CommandItem command="Add [Name] as friend" description="Sends a friend request to the specified user on their profile." />
                    <CommandItem command="Accept [Name]'s request" description="Accepts a pending friend request from a user." />
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
