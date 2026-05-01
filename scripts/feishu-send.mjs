#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as lark from '@larksuiteoapi/node-sdk';

const CTI_HOME = process.env.CTI_HOME || path.join(os.homedir(), '.claude-to-im');
const CONFIG_FILE = path.join(CTI_HOME, 'config.env');
const BINDINGS_FILE = path.join(CTI_HOME, 'data', 'bindings.json');

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  feishu-send.mjs --text "message" [--chat CHAT_ID] [--dry-run]
  feishu-send.mjs --file /path/to/file [--text "caption"] [--chat CHAT_ID] [--dry-run]
  feishu-send.mjs --image /path/to/image.png [--text "caption"] [--chat CHAT_ID] [--dry-run]

Defaults:
  --chat defaults to the active/recent Feishu chat in ~/.claude-to-im/data/bindings.json

Notes:
  For --file/--image with --text, text is sent first, then the attachment.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--text') {
      args.text = argv[++index];
    } else if (arg === '--file') {
      args.file = argv[++index];
    } else if (arg === '--image') {
      args.image = argv[++index];
    } else if (arg === '--chat') {
      args.chat = argv[++index];
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage(2);
    }
  }
  if (!args.text && !args.file && !args.image) usage(2);
  if (args.file && args.image) {
    console.error('Use either --file or --image, not both.');
    process.exit(2);
  }
  return args;
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing config: ${filePath}`);
  }
  const env = new Map();
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env.set(trimmed.slice(0, eq), unquote(trimmed.slice(eq + 1)));
  }
  return env;
}

function getDefaultChatId() {
  if (!fs.existsSync(BINDINGS_FILE)) {
    throw new Error(`No bindings file found; pass --chat explicitly. Missing: ${BINDINGS_FILE}`);
  }
  const bindings = JSON.parse(fs.readFileSync(BINDINGS_FILE, 'utf8'));
  const candidates = Object.values(bindings)
    .filter((binding) => binding && binding.channelType === 'feishu' && binding.chatId)
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
      return rightTime - leftTime;
    });
  const active = candidates.find((binding) => binding.active !== false) || candidates[0];
  if (!active) throw new Error('No Feishu chat binding found; pass --chat explicitly.');
  return active.chatId;
}

function resolveDomain(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('larksuite') || normalized === 'lark') return lark.Domain.Lark;
  return lark.Domain.Feishu;
}

function createClient(env) {
  const appId = env.get('CTI_FEISHU_APP_ID');
  const appSecret = env.get('CTI_FEISHU_APP_SECRET');
  if (!appId || !appSecret) {
    throw new Error('CTI_FEISHU_APP_ID or CTI_FEISHU_APP_SECRET is not configured.');
  }
  return new lark.Client({
    appId,
    appSecret,
    domain: resolveDomain(env.get('CTI_FEISHU_DOMAIN')),
  });
}

function expandPath(filePath) {
  if (!filePath) return filePath;
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2));
  return path.resolve(filePath);
}

function fileTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xls';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (['mp4', 'mov', 'm4v'].includes(ext)) return 'mp4';
  if (['opus', 'ogg'].includes(ext)) return 'opus';
  return 'stream';
}

function isImagePath(filePath) {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tif', '.tiff', '.bmp', '.ico']
    .includes(path.extname(filePath).toLowerCase());
}

async function sendText(client, chatId, text) {
  const response = await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
      uuid: crypto.randomUUID(),
    },
  });
  if (!response?.data?.message_id) {
    throw new Error(response?.msg || 'Text send failed');
  }
  return response.data.message_id;
}

async function uploadAndSendImage(client, chatId, filePath) {
  const upload = await client.im.image.create({
    data: {
      image_type: 'message',
      image: fs.createReadStream(filePath),
    },
  });
  if (!upload?.image_key) throw new Error('Image upload failed: missing image_key');
  const response = await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'image',
      content: JSON.stringify({ image_key: upload.image_key }),
      uuid: crypto.randomUUID(),
    },
  });
  if (!response?.data?.message_id) {
    throw new Error(response?.msg || 'Image message send failed');
  }
  return response.data.message_id;
}

async function uploadAndSendFile(client, chatId, filePath) {
  const upload = await client.im.file.create({
    data: {
      file_type: fileTypeFor(filePath),
      file_name: path.basename(filePath),
      file: fs.createReadStream(filePath),
    },
  });
  if (!upload?.file_key) throw new Error('File upload failed: missing file_key');
  const response = await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'file',
      content: JSON.stringify({ file_key: upload.file_key }),
      uuid: crypto.randomUUID(),
    },
  });
  if (!response?.data?.message_id) {
    throw new Error(response?.msg || 'File message send failed');
  }
  return response.data.message_id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = readEnvFile(CONFIG_FILE);
  const chatId = args.chat || getDefaultChatId();
  const attachment = expandPath(args.image || args.file || '');
  const mode = args.image || (args.file && isImagePath(attachment)) ? 'image' : (args.file ? 'file' : 'text');

  if (attachment && !fs.existsSync(attachment)) {
    throw new Error(`File not found: ${attachment}`);
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      chatId,
      mode,
      text: args.text || '',
      file: attachment || undefined,
    }, null, 2));
    return;
  }

  const client = createClient(env);
  const sent = [];
  if (args.text) {
    sent.push({ type: 'text', messageId: await sendText(client, chatId, args.text) });
  }
  if (attachment) {
    const messageId = mode === 'image'
      ? await uploadAndSendImage(client, chatId, attachment)
      : await uploadAndSendFile(client, chatId, attachment);
    sent.push({ type: mode, messageId, file: attachment });
  }

  console.log(JSON.stringify({ ok: true, chatId, sent }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
