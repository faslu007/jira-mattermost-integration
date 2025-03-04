const dotenv = require('dotenv').config();
const fs = require('fs');
const QuickChart = require('quickchart-js');


async function getJiraMonthlyBugAnalytics() {
    const jiraToken = process.env.JIRA_TOKEN;
    const jiraServiceDomain = process.env.JIRA_SERVICE_DOMAIN;
    const jiraProjectKey = process.env.JIRA_PROJECT_KEY;

    if (!jiraToken || !jiraServiceDomain) {
        throw new Error('Jira configuration missing');
    }

    const headers = {
        'Authorization': `Basic ${Buffer.from(jiraToken).toString('base64')}`,
        'Accept': 'application/json'
    };

    const fetchJiraData = async (jql) => {
        const response = await fetch(`${jiraServiceDomain}/rest/api/3/search?jql=${encodeURIComponent(jql)}`, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to fetch Jira data: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        return data.total;
    };

    try {
        // Total Known Bugs in the System
        const totalKnownBugsJQL = `project = "${jiraProjectKey}" and type = Bug and status NOT IN(Archived, Closed, Done) ORDER BY created DESC`;
        const totalKnownBugs = await fetchJiraData(totalKnownBugsJQL);

        // New Bugs registered current month so far
        const newBugsJQL = `project = "${jiraProjectKey}" and type = Bug and status NOT IN (Archived, Closed, Done) AND created > startOfMonth() ORDER BY created DESC`;
        const bugsRegisteredCurrentMonthSofar = await fetchJiraData(newBugsJQL);

        // Bugs Fixed in the current month
        const bugsFixedJQL = `project = "${jiraProjectKey}" and type = Bug and status IN (Done) AND created > startOfMonth() ORDER BY created DESC`;
        const bugsFixedCurrentMonthSofar = await fetchJiraData(bugsFixedJQL);

        console.log(totalKnownBugs, bugsRegisteredCurrentMonthSofar, bugsFixedCurrentMonthSofar)
        return [
            totalKnownBugs,
            bugsRegisteredCurrentMonthSofar,
            bugsFixedCurrentMonthSofar
        ];
    } catch (error) {
        console.error('Error fetching Jira analytics:', error);
        throw error;
    }
}

async function createBugAnalyticsChart() {
    const analyticsData = await getJiraMonthlyBugAnalytics();

    const chart = new QuickChart();
    chart.setConfig({
        type: 'bar',
        data: {
            labels: ['Total Known Bugs', 'New Bugs', 'Bugs Fixed'],
            datasets: [{
                label: `Bugs Count (${new Date().toLocaleString('default', { month: 'long' })} 1 - ${new Date().getDate()})`,
                data: analyticsData,
                backgroundColor: ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(75, 192, 192, 0.2)'],
                borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(75, 192, 192, 1)'],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Set the chart dimensions and resolution
    chart.setWidth(1000); // Set the width in pixels
    chart.setHeight(600); // Set the height in pixels
    chart.setDevicePixelRatio(2); // Set the device pixel ratio for higher resolution


    // Get the chart URL
    const chartUrl = chart.getUrl();
    console.log('Chart URL:', chartUrl);

    // Optionally, download the chart image
    const imageBuffer = await chart.toBinary();
    require('fs').writeFileSync('./bug-analytics-chart.png', imageBuffer);
    console.log('Chart saved as bug-analytics-chart.png');
}

async function createMultiLineBugChart() {
    const jiraToken = process.env.JIRA_TOKEN;
    const jiraServiceDomain = process.env.JIRA_SERVICE_DOMAIN;
    const jiraProjectKey = process.env.JIRA_PROJECT_KEY;

    if (!jiraToken || !jiraServiceDomain) {
        throw new Error('Jira configuration missing');
    }

    const headers = {
        'Authorization': `Basic ${Buffer.from(jiraToken).toString('base64')}`,
        'Accept': 'application/json'
    };

    const fetchJiraData = async (jql) => {
        const response = await fetch(`${jiraServiceDomain}/rest/api/3/search?jql=${encodeURIComponent(jql)}`, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to fetch Jira data: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        return data.total;
    };

    const fetchMonthlyData = async (monthOffset) => {
        const date = new Date();
        date.setMonth(date.getMonth() - monthOffset);
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

        const createdJQL = `project = "${jiraProjectKey}" and type = Bug and created >= "${startOfMonth}" and created <= "${endOfMonth}"`;
        const fixedJQL = `project = "${jiraProjectKey}" and type = Bug and status = Done and updated >= "${startOfMonth}" and updated <= "${endOfMonth}"`;

        const createdCount = await fetchJiraData(createdJQL);
        const fixedCount = await fetchJiraData(fixedJQL);

        return { createdCount, fixedCount, month: date.toLocaleString('default', { month: 'long' }) };
    };

    const lastFiveMonthsData = await Promise.all([
        fetchMonthlyData(4),
        fetchMonthlyData(3),
        fetchMonthlyData(2),
        fetchMonthlyData(1),
        fetchMonthlyData(0)
    ]);

    const chart = new QuickChart();
    chart.setConfig({
        type: 'line',
        data: {
            labels: lastFiveMonthsData.map(data => data.month),
            datasets: [
                {
                    label: 'Bugs Created',
                    data: lastFiveMonthsData.map(data => data.createdCount),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    fill: false
                },
                {
                    label: 'Bugs Fixed',
                    data: lastFiveMonthsData.map(data => data.fixedCount),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    fill: false
                }
            ]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Set the chart dimensions and resolution
    chart.setWidth(1000); // Set the width in pixels
    chart.setHeight(600); // Set the height in pixels
    chart.setDevicePixelRatio(2); // Set the device pixel ratio for higher resolution

    // Generate the chart URL or download the image
    const chartUrl = await chart.getShortUrl();
    console.log('Chart URL:', chartUrl);

    // Optionally, download the chart image
    await chart.toFile('./multi-line-bug-chart.png');
}

module.exports = { createBugAnalyticsChart, createMultiLineBugChart };