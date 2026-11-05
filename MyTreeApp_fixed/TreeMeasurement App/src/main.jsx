import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// 화면 그리기 중 오류가 나도 검은 화면 대신 오류 내용을 보여줍니다.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', color: '#fff' }}>
          <h3>⚠️ 앱 실행 중 오류가 발생했습니다</h3>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#fca5a5' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
rootEl.dataset.rendered = '1' // index.html의 오류 표시기가 정상 화면을 덮어쓰지 않도록
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
