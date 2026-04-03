// 错误边界组件
// 捕获子组件树中的渲染异常，显示友好提示而不是白屏
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('页面渲染异常:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          padding: '40px',
          color: 'var(--text-muted, #999)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>😵</div>
          <div style={{ fontSize: '15px', marginBottom: '8px', color: 'var(--text-primary, #333)' }}>
            页面渲染出错了
          </div>
          <div style={{ fontSize: '12px', marginBottom: '20px', maxWidth: '400px', lineHeight: '1.6' }}>
            {this.state.error?.message || '未知错误'}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: '1px solid var(--border, #ddd)',
              background: 'var(--accent, #2a5c45)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
