const dotenv = require('dotenv').config();
const schedule = require('node-schedule');


const getDailyFeedsFromJira = async () => {
    try {
        const jiraToken = process.env.JIRA_TOKEN;
        const jiraUri = process.env.JIRA_URI;
        const jiraServiceDomain = process.env.JIRA_SERVICE_DOMAIN
        const jiraProjectKey = process.env.JIRA_PROJECT_KEY
        
        if (!jiraToken || !jiraUri) {
            throw new Error('Jira configuration missing');
        }

        // Get today's date and yesterday's date in Jira's preferred format
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const jqlDateFormat = date => date.toISOString().split('T')[0];

        // JQL queries for new and transitioned tickets
        const newTicketsJQL = `project = ${jiraProjectKey} AND created >= '${jqlDateFormat(yesterday)}' AND created <= '${jqlDateFormat(today)}'`;
        const transitionedTicketsJQL = `project = ${jiraProjectKey} AND status changed AFTER '${jqlDateFormat(yesterday)}' AND status changed BEFORE '${jqlDateFormat(today)}'`;

        // Fetch both new and transitioned tickets
        const [newTickets, transitionedTickets] = await Promise.all([
            fetch(`${jiraUri}/rest/api/3/search?jql=${encodeURIComponent(newTicketsJQL)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${Buffer.from(jiraToken).toString('base64')}`,
                    'Accept': 'application/json'
                }
            }),
            fetch(`${jiraUri}/rest/api/3/search?jql=${encodeURIComponent(transitionedTicketsJQL)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${Buffer.from(jiraToken).toString('base64')}`,
                    'Accept': 'application/json'
                }
            })
        ]);

        const [newTicketsData, transitionedTicketsData] = await Promise.all([
            newTickets.json(),
            transitionedTickets.json()
        ]);

        // Format the results
        const formatTicket = issue => ({
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            assignee: issue.fields.assignee?.displayName || 'Unassigned',
            created: issue.fields.created,
            updated: issue.fields.updated,
            issueType: issue.fields.issuetype.name,
            priority: issue.fields.priority.name,
            sprint: issue.fields.customfield_10020 ? 
                    issue.fields.customfield_10020[0]?.name || 'No Sprint' : 
                   'No Sprint'  // Adjust customfield number if different in your Jira instance
        });

        const result = {
            newTickets: newTicketsData.issues.map(formatTicket),
            transitionedTickets: transitionedTicketsData.issues.map(formatTicket)
        };

        // Helper function to get priority emoji
        const getPriorityEmoji = priority => {
            switch(priority.toLowerCase()) {
                case 'highest': return '🔴';
                case 'high': return '🟠';
                case 'medium': return '🟡';
                case 'low': return '🟢';
                case 'lowest': return '⚪';
                default: return '⚫';
            }
        };

        // Helper function to get issue type emoji
        const getIssueTypeEmoji = type => {
            switch(type.toLowerCase()) {
                case 'bug': return '🐛';
                case 'task': return '📋';
                case 'story': return '📚';
                case 'epic': return '🏆';
                case 'improvement': return '⭐';
                default: return '📌';
            }
        };

        const getSprintTag = (sprint) => {
            if (!sprint || sprint === 'No Sprint') return '📌 No Sprint';
            
            const sprintLower = sprint.toLowerCase();
            
            if (sprintLower.includes('roadmap')) {
                return '🎯 Roadmap';
            } else if (sprintLower.includes('stability')) {
                return '🛡️ Stability';
            } else if (sprintLower.includes('backlog')) {
                return '📋 Backlog';
            } else if (sprintLower.includes('current')) {
                return '🎯 Current';
            } else {
                return `🏃 ${sprint}`;
            }
        };

        // Create a formatted message for Mattermost
        const message = {
            text: `
# 📊 Daily Jira Update (${jqlDateFormat(today)})

## 🆕 New Tickets (${result.newTickets.length})
| ID | Type | Priority | Summary | Assignee | Status | Tag |
|:---|:-----|:---------|:--------|:---------|:-------|:-------|
${result.newTickets.map(ticket => 
    `| [${ticket.key}](${jiraServiceDomain}/browse/${ticket.key}) | ${getIssueTypeEmoji(ticket.issueType)} ${ticket.issueType} | ${getPriorityEmoji(ticket.priority)} ${ticket.priority} | ${ticket.summary} | 👤 ${ticket.assignee} | 🏷️ ${ticket.status} | ${getSprintTag(ticket.sprint)} |`
).join('\n')}

## 🔄 Status Changes (${result.transitionedTickets.length})
| ID | Type | Priority | Summary | Assignee | Current Status | Tag |
|:---|:-----|:---------|:--------|:---------|:---------------|:-------|
${result.transitionedTickets.map(ticket => 
    `| [${ticket.key}](${jiraServiceDomain}/browse/${ticket.key}) | ${getIssueTypeEmoji(ticket.issueType)} ${ticket.issueType} | ${getPriorityEmoji(ticket.priority)} ${ticket.priority} | ${ticket.summary} | 👤 ${ticket.assignee} | 🏷️ ${ticket.status} | ${getSprintTag(ticket.sprint)} |`
).join('\n')}

> 🔍 Click on ticket IDs to view details
`
        };

        // Post to Mattermost
        await postMessageToMatterMostChannel(process.env.CHANNEL, message);

        return result;
    } catch (error) {
        console.error('Error fetching Jira feeds:', error);
        throw error;
    }
};


const postMessageToMatterMostChannel = async (channel, payload) => {
    try {
        const mattermostUrl = process.env.MATTERMOST_URL;
        const apiToken = process.env.MATTERMOST_TOKEN;
        
        if (!mattermostUrl || !apiToken) {
            throw new Error('Mattermost URL or API token not configured');
        }

        const response = await fetch(`${mattermostUrl}/api/v4/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`,
            },
            body: JSON.stringify({
                channel_id: channel,
                "username": "test-automation",
                message: payload?.text ?? "TEST FROM BOT JS",
                props: {
                    from_bot: true,
                    override_username: "Jira Bot",
                    override_icon_url: "https://jira.atlassian.com/favicon.ico",
                    notification_sound: "bing"
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to post to Mattermost: ${errorData.message || response.statusText}`);
        }

        return true;
    } catch (error) {
        console.error('Mattermost posting error:', error);
        throw error;
    }
};

// Schedule the job to run at 9 AM every working day (Monday to Friday)
const scheduleJiraFeedJob = () => {
    const rule = new schedule.RecurrenceRule();
    rule.hour = 16;    // 9 AM
    rule.minute = 50;  // At minute 0
    rule.dayOfWeek = [1, 2, 3, 4, 5];  // Monday to Friday
    rule.tz = 'Asia/Kolkata';  
    schedule.scheduleJob(rule, async () => {
        console.log(`Running Jira feed job at ${new Date().toLocaleString()}`);
        try {
            console.log('test')
            console.log(process.env.JIRA_URI)
            await getDailyFeedsFromJira();
            console.log('Jira feed job completed successfully');
        } catch (error) {
            console.error('Error in Jira feed job:', error);
        }
    });

    console.log('Jira feed job scheduled');
};

scheduleJiraFeedJob();

// getDailyFeedsFromJira()
