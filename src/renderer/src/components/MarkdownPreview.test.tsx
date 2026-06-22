import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownPreview } from './MarkdownPreview';

describe('MarkdownPreview', () => {
  it('禁用 HTML 透传并移除危险事件属性', () => {
    const { container } = render(
      <MarkdownPreview content={'# 标题\n[安全链接](https://example.com)\n\n<img src=x onerror=alert(1)>\n<script>alert(1)</script>'} />
    );

    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '安全链接' })).toHaveAttribute('href', 'https://example.com');
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('alert(1)');
  });

  it('阻断 javascript 链接和非图片 data 协议图片', () => {
    const { container } = render(
      <MarkdownPreview content={'[恶意链接](javascript:alert(1))\n![恶意图片](data:text/html;base64,PHNjcmlwdD5hPC9zY3JpcHQ+)'} />
    );

    expect(screen.getByText('恶意链接').tagName).toBe('SPAN');
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('javascript:');
    expect(container.innerHTML).not.toContain('data:text/html');
  });

  it('允许安全链接协议和安全图片协议', () => {
    const { container } = render(
      <MarkdownPreview content={'[邮件](mailto:test@example.com)\n![安全图片](https://example.com/a.png)'} />
    );

    expect(screen.getByRole('link', { name: '邮件' })).toHaveAttribute('href', 'mailto:test@example.com');
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://example.com/a.png');
    expect(image).toHaveAttribute('alt', '安全图片');
  });
});
