import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { approvalPolicyForCodex, decidePermission } from '../permission-policy.js';

describe('decidePermission', () => {
  it('always policy requires approval', () => {
    const result = decidePermission({
      policy: 'always',
      toolName: 'Read',
      input: { file_path: 'README.md' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'ask');
  });

  it('never policy auto-approves', () => {
    const result = decidePermission({
      policy: 'never',
      toolName: 'Bash',
      input: { command: 'rm -rf build' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy auto-approves read-only tools', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Read',
      input: { file_path: 'README.md' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy auto-approves workdir-local edits', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Edit',
      input: { file_path: 'src/main.ts' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy requires approval for sensitive edit targets', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Write',
      input: { file_path: '~/.ssh/config' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'ask');
    assert.match(result.reason, /sensitive/i);
  });

  it('smart policy requires approval for writes outside the workdir', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Write',
      input: { file_path: '../notes.txt' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'ask');
    assert.match(result.reason, /outside the working directory/i);
  });

  it('smart policy auto-approves safe shell inspection commands', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Bash',
      input: { command: 'git status --short' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy requires approval for dangerous shell commands', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Bash',
      input: { command: 'git push origin main' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'ask');
    assert.match(result.reason, /repository state|remote/i);
  });

  it('smart policy auto-approves read-only curl fetches', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Bash',
      input: { command: 'curl -s https://api.github.com/repos/openai/codex' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy requires approval for curl uploads or POST-like requests', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Bash',
      input: { command: "curl -X POST https://example.com/api -d 'secret=1'" },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'ask');
    assert.match(result.reason, /upload|modify remote state|send data/i);
  });

  it('smart policy auto-approves bridge IM API calls', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'Bash',
      input: { command: 'curl -s https://api.telegram.org/bot123:abc/sendMessage?chat_id=1&text=done' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy auto-approves IM delivery MCP tools', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'mcp__slack__post_message',
      input: { channel: 'ops', text: 'deploy' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy auto-approves read-like MCP tools', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'mcp__notion__list_pages',
      input: { query: 'project' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy auto-approves read-only WebFetch', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'WebFetch',
      input: { url: 'https://example.com/docs' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'allow');
  });

  it('smart policy requires approval for WebFetch with request body', () => {
    const result = decidePermission({
      policy: 'smart',
      toolName: 'WebFetch',
      input: { url: 'https://example.com/api', method: 'POST', body: '{"x":1}' },
      workingDirectory: '/tmp/project',
    });
    assert.equal(result.behavior, 'ask');
  });
});

describe('approvalPolicyForCodex', () => {
  it('uses never only for explicit never policy', () => {
    assert.equal(approvalPolicyForCodex('never'), 'never');
    assert.equal(approvalPolicyForCodex('always'), 'on-request');
    assert.equal(approvalPolicyForCodex('smart'), 'on-request');
  });
});
