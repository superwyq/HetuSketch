/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ConfigProvider, theme, Result, Button } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
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
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f5efe3' }}>
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
            colorPrimary: '#8b4a22',
            colorSuccess: '#3f7d58',
            colorWarning: '#b9770e',
            colorError: '#9f2d20',
            borderRadius: 12,
            fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif'
          },
          components: {
            Layout: {
              bodyBg: themeMode === 'dark' ? '#17140f' : '#f5efe3',
              siderBg: themeMode === 'dark' ? '#201b13' : '#2b2118',
              headerBg: themeMode === 'dark' ? '#201b13' : '#fff9ed'
            },
            Menu: {
              darkItemBg: '#2b2118',
              darkSubMenuItemBg: '#2b2118',
              darkItemSelectedBg: '#8b4a22'
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
