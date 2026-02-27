const fetch = require('node-fetch');
const db = require('./db');

async function sendSlackAlert({ wss, errorType, zone, network, message }) {
  const webhookUrl = db.prepare("SELECT value FROM settings WHERE key='slack_webhook'").get()?.value;
  
  if (!webhookUrl) {
    console.warn('[Slack] No webhook URL configured, skipping alert');
    return;
  }

  const errorEmoji = {
    connect: '🔴',
    blockzero: '🟠', 
    version: '🟡',
    unknown: '⚠️'
  }[errorType] || '⚠️';

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${errorEmoji} RPC Monitor Alert — Radiumblock`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Endpoint:*\n\`${wss}\`` },
          { type: 'mrkdwn', text: `*Error Type:*\n${errorType}` },
          { type: 'mrkdwn', text: `*Zone:*\n${zone}` },
          { type: 'mrkdwn', text: `*Network:*\n${network}` }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Details:* ${message}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕐 Detected at: ${new Date().toUTCString()} | Login to RPC Monitor dashboard to view logs and restart services`
          }
        ]
      }
    ]
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Slack responded with ${res.status}`);
  }
}

module.exports = { sendSlackAlert };
