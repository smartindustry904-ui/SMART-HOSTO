#!/usr/bin/env node
/**
 * WhatsApp Business MCP Server (Local Stdio)
 * Bridges Meta WhatsApp Cloud API directly to Antigravity / AI Agents via Model Context Protocol.
 */

const readline = require('readline');
const https = require('https');

const ACCESS_TOKEN =
  process.env.WHATSAPP_ACCESS_TOKEN ||
  'EAAXqH5BreUQBSwx42JRmInFr2mkOkjMDK8y5aKrts4uVhZBFpZC2mGef3Q3kelzr0dTMMShXTm5P6vDpZAnRCAPUDrFVeM4W3nxmIZAUpsOfxeDovoi3ZA79U0uoP6QKMSd7Vw7BqDRaL5ZA06y2IObXd4gN32GhsSQF6s6auHOJcQqqyrCV7qCMCVd560Rl33SZC6rO8Kx6WBir2uKeHQq7qF6rQNMgVUYNDFQktB8';

const DEFAULT_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

function callGraphApi(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const fullPath = path.includes('?')
      ? `${path}&access_token=${encodeURIComponent(ACCESS_TOKEN)}`
      : `${path}?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;

    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v21.0/${fullPath.replace(/^\//, '')}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400 || parsed.error) {
            reject(new Error(parsed.error ? parsed.error.message : `HTTP ${res.statusCode}: ${body}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data && (method === 'POST' || method === 'PUT')) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

const TOOLS = [
  {
    name: 'whatsapp_get_account_info',
    description: 'Inspect current Meta WhatsApp Business token status, App ID, System User, and granted scopes.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'whatsapp_get_phone_numbers',
    description: 'Retrieve phone numbers and their verified status from a WhatsApp Business Account (WABA ID) or Phone Number ID.',
    inputSchema: {
      type: 'object',
      properties: {
        waba_or_phone_id: {
          type: 'string',
          description: 'The WhatsApp Business Account ID or Phone Number ID to inspect.'
        }
      },
      required: ['waba_or_phone_id']
    }
  },
  {
    name: 'whatsapp_send_message',
    description: 'Send a real WhatsApp text message to any phone number using the Meta WhatsApp Cloud API.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number with country code (e.g. 237690000000 or +237690000000).'
        },
        message: {
          type: 'string',
          description: 'The text message content to send.'
        },
        phone_number_id: {
          type: 'string',
          description: 'Optional Meta Phone Number ID. Defaults to configured environment value if omitted.'
        }
      },
      required: ['to', 'message']
    }
  },
  {
    name: 'whatsapp_send_template',
    description: 'Send a pre-approved Meta WhatsApp template message (e.g. hello_world).',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number with country code.'
        },
        template_name: {
          type: 'string',
          description: 'The name of the approved template (default: hello_world).'
        },
        language_code: {
          type: 'string',
          description: 'Language code (e.g. en_US, fr, en). Default: en_US.'
        },
        phone_number_id: {
          type: 'string',
          description: 'Optional Meta Phone Number ID.'
        }
      },
      required: ['to']
    }
  },
  {
    name: 'whatsapp_list_templates',
    description: 'List approved message templates from your WhatsApp Business Account (WABA).',
    inputSchema: {
      type: 'object',
      properties: {
        waba_id: {
          type: 'string',
          description: 'Your WhatsApp Business Account (WABA) ID.'
        }
      },
      required: ['waba_id']
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'whatsapp_get_account_info': {
      const debug = await callGraphApi(`debug_token?input_token=${encodeURIComponent(ACCESS_TOKEN)}`);
      const me = await callGraphApi('me');
      return {
        app_name: debug.data?.application,
        app_id: debug.data?.app_id,
        user_name: me?.name,
        user_id: me?.id,
        token_type: debug.data?.type,
        is_valid: debug.data?.is_valid,
        scopes: debug.data?.scopes,
        configured_default_phone_id: DEFAULT_PHONE_NUMBER_ID || '(none set yet)'
      };
    }

    case 'whatsapp_get_phone_numbers': {
      const id = String(args.waba_or_phone_id || DEFAULT_PHONE_NUMBER_ID).trim();
      if (!id) throw new Error('waba_or_phone_id parameter is required.');
      try {
        const res = await callGraphApi(`${id}/phone_numbers`);
        return res;
      } catch {
        // Fallback: try inspecting as a single phone number node
        const res = await callGraphApi(`${id}?fields=id,display_phone_number,verified_name,quality_rating`);
        return res;
      }
    }

    case 'whatsapp_send_message': {
      const phoneId = String(args.phone_number_id || DEFAULT_PHONE_NUMBER_ID).trim();
      if (!phoneId) {
        throw new Error('phone_number_id is required (either provide it in arguments or set WHATSAPP_PHONE_NUMBER_ID in env).');
      }
      const cleanTo = String(args.to || '').replace(/[^0-9]/g, '');
      if (!cleanTo) throw new Error('Recipient "to" phone number is required.');

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: String(args.message || '')
        }
      };

      const result = await callGraphApi(`${phoneId}/messages`, 'POST', payload);
      return {
        success: true,
        message: `WhatsApp message successfully dispatched to ${cleanTo}`,
        meta_message_id: result.messages?.[0]?.id,
        response: result
      };
    }

    case 'whatsapp_send_template': {
      const phoneId = String(args.phone_number_id || DEFAULT_PHONE_NUMBER_ID).trim();
      if (!phoneId) {
        throw new Error('phone_number_id is required.');
      }
      const cleanTo = String(args.to || '').replace(/[^0-9]/g, '');
      const templateName = args.template_name || 'hello_world';
      const lang = args.language_code || 'en_US';

      const payload = {
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: lang }
        }
      };

      const result = await callGraphApi(`${phoneId}/messages`, 'POST', payload);
      return {
        success: true,
        message: `Template "${templateName}" sent to ${cleanTo}`,
        meta_message_id: result.messages?.[0]?.id,
        response: result
      };
    }

    case 'whatsapp_list_templates': {
      const wabaId = String(args.waba_id).trim();
      if (!wabaId) throw new Error('waba_id is required.');
      const res = await callGraphApi(`${wabaId}/message_templates`);
      return res;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function sendResponse(id, result, isError = false) {
  const response = {
    jsonrpc: '2.0',
    id: id
  };
  if (isError) {
    response.error = {
      code: -32000,
      message: typeof result === 'string' ? result : JSON.stringify(result)
    };
  } else {
    response.result = result;
  }
  process.stdout.write(JSON.stringify(response) + '\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = message;

  // Handle Notifications
  if (id === undefined || id === null) {
    return;
  }

  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'whatsapp-business-local',
          version: '1.0.0'
        }
      });
      break;

    case 'ping':
      sendResponse(id, {});
      break;

    case 'tools/list':
      sendResponse(id, {
        tools: TOOLS
      });
      break;

    case 'tools/call':
      try {
        const { name, arguments: toolArgs } = params || {};
        const result = await handleToolCall(name, toolArgs || {});
        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: false
        });
      } catch (err) {
        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: `Error: ${err.message}`
            }
          ],
          isError: true
        });
      }
      break;

    default:
      sendResponse(id, `Method "${method}" not supported`, true);
      break;
  }
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
