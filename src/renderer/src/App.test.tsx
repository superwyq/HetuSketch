import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfigProvider } from 'antd';
import { HashRouter } from 'react-router-dom';
import { App } from './App';

describe('App shell', () => {
  it('renders the HetuSketch dashboard navigation', () => {
    render(
      <ConfigProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ConfigProvider>
    );

    expect(screen.getByText('HetuSketch')).toBeInTheDocument();
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索角色、世界观规则、伏笔线索...')).toBeInTheDocument();
  });
});
