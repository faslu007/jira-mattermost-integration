const deleteAllMessagesInChannel = async (channelId) => {
    try {
        const mattermostUrl = process.env.MATTERMOST_URL;
        const apiToken = process.env.MATTERMOST_TOKEN;

        if (!mattermostUrl || !apiToken) {
            throw new Error('Mattermost URL or API token not configured');
        }

        // First, get all posts in the channel
        const response = await fetch(`${mattermostUrl}/api/v4/channels/${channelId}/posts`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to fetch posts: ${errorData.message || response.statusText}`);
        }

        const posts = await response.json();

        // Update each post to empty string
        const updatePromises = Object.keys(posts.posts).map(async (postId) => {
            const updateResponse = await fetch(`${mattermostUrl}/api/v4/posts/${postId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: postId,
                    message: "",
                    props: {} // Clear any props
                })
            });

            if (!updateResponse.ok) {
                console.error(`Failed to update post ${postId}: ${updateResponse.statusText}`);
            }

            // Add a small delay to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        await Promise.all(updatePromises);
        console.log('Successfully cleared all messages in the channel');
        return true;

    } catch (error) {
        console.error('Error clearing messages:', error);
        throw error;
    }
};