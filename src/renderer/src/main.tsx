/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ConfigProvider, theme, Result, Button } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import '../assets/styles/variables.css';
import './styles.css';
import { App } from './App';
import { useAppStore } from './store/appStore';

function checkPreload(): boolean {
  return typeof (window as unknown as { hetuSketch?: unknown }).hetuSketch !== 'undefined';
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean; error: string } {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[HetuSketch] React render error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--color-background)' }}>
          <Result
            status="error"
            title="界面渲染失败"
            subTitle={this.state.error}
            extra={
              <Button type="primary" onClick={() => this.setState({ hasError: false, error: '' })}>
                重试
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

function Root(): React.JSX.Element {
  const themeMode = useAppStore((state) => state.themeMode);

  React.useEffect(() => {
    console.log('[HetuSketch] Root mounted, preload available:', checkPreload());
    if (!checkPreload()) {
      console.error('[HetuSketch] window.hetuSketch is undefined — preload script may have failed to load');
    }
  }, []);

  return (
    <React.StrictMode>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: 'oklch(0.62 0.17 255)',
            colorSuccess: 'oklch(0.65 0.17 145)',
            colorWarning: 'oklch(0.72 0.16 75)',
            colorError: 'oklch(0.60 0.20 25)',
            colorInfo: 'oklch(0.62 0.15 240)',
            borderRadius: 6,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 14
          },
          components: {
            Layout: {
              bodyBg: themeMode === 'dark' ? '#0a0a0a' : '#f5f5f5',
              siderBg: themeMode === 'dark' ? 'oklch(0.16 0 0)' : 'oklch(0.98 0 0)',
              headerBg: themeMode === 'dark' ? 'oklch(0.15 0 0)' : 'oklch(0.97 0 0)'
            },
            Menu: {
              darkItemBg: 'oklch(0.16 0 0)',
              darkSubMenuItemBg: 'oklch(0.16 0 0)',
              darkItemSelectedBg: 'oklch(0.62 0.17 255)'
            }
          }
        }}
      >
        <HashRouter>
          <RootErrorBoundary>
            <App />
          </RootErrorBoundary>
        </HashRouter>
      </ConfigProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
