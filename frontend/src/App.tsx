import { useEffect, useState } from 'react'
import { apiClient, type HealthResponse, type HealthDbResponse } from './api/client'
import './App.css'

type Status = 'idle' | 'loading' | 'ok' | 'error'

interface SystemStatus {
  api: Status
  db: Status
  apiData?: HealthResponse
  dbData?: HealthDbResponse
  apiError?: string
  dbError?: string
}

function StatusBadge({ status }: { status: Status }) {
  const config: Record<Status, { label: string; className: string }> = {
    idle:    { label: 'Waiting…',   className: 'badge badge-idle' },
    loading: { label: 'Checking…', className: 'badge badge-loading' },
    ok:      { label: 'Connected',  className: 'badge badge-ok' },
    error:   { label: 'Unavailable', className: 'badge badge-error' },
  }
  const { label, className } = config[status]
  return <span className={className}>{label}</span>
}

function App() {
  const [sys, setSys] = useState<SystemStatus>({ api: 'idle', db: 'idle' })

  const checkHealth = async () => {
    setSys({ api: 'loading', db: 'loading' })

    // Check API health
    let apiStatus: Status = 'error'
    let apiData: HealthResponse | undefined
    let apiError: string | undefined

    try {
      apiData = await apiClient.getHealth()
      apiStatus = apiData.status === 'ok' ? 'ok' : 'error'
    } catch (e) {
      apiError = e instanceof Error ? e.message : 'Unknown error'
    }

    setSys(prev => ({ ...prev, api: apiStatus, apiData, apiError }))

    // Check DB health
    let dbStatus: Status = 'error'
    let dbData: HealthDbResponse | undefined
    let dbError: string | undefined

    try {
      dbData = await apiClient.getHealthDb()
      dbStatus = dbData.status === 'ok' ? 'ok' : 'error'
    } catch (e) {
      dbError = e instanceof Error ? e.message : 'Unknown error'
    }

    setSys(prev => ({ ...prev, db: dbStatus, dbData, dbError }))
  }

  useEffect(() => {
    checkHealth()
  }, [])

  const allOk = sys.api === 'ok' && sys.db === 'ok'
  const anyLoading = sys.api === 'loading' || sys.db === 'loading'

  return (
    <div className="page">
      {/* Header */}
      <header className="hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="logo">
            <span className="logo-icon">🛒</span>
            <span className="logo-text">LOCOMART</span>
          </div>
          <p className="tagline">Local Grocery Assistance Platform</p>
          <div className={`milestone-badge ${allOk ? 'milestone-ok' : ''}`}>
            Milestone M0 — Foundation
          </div>
        </div>
      </header>

      {/* Status Panel */}
      <main className="main">
        <section className="status-card">
          <div className="card-header">
            <h2>System Status</h2>
            <button
              className="refresh-btn"
              onClick={checkHealth}
              disabled={anyLoading}
            >
              {anyLoading ? '⟳ Checking…' : '↻ Refresh'}
            </button>
          </div>

          <div className="status-rows">
            {/* API Row */}
            <div className="status-row">
              <div className="status-label">
                <span className="status-icon">⚡</span>
                <div>
                  <div className="status-name">FastAPI Backend</div>
                  <div className="status-url">{import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/health</div>
                </div>
              </div>
              <StatusBadge status={sys.api} />
            </div>
            {sys.apiError && (
              <div className="status-error">⚠ {sys.apiError}</div>
            )}

            {/* DB Row */}
            <div className="status-row">
              <div className="status-label">
                <span className="status-icon">🗄</span>
                <div>
                  <div className="status-name">PostgreSQL (InsForge)</div>
                  {sys.dbData?.version && (
                    <div className="status-url">{sys.dbData.version.split(' ').slice(0, 2).join(' ')}</div>
                  )}
                </div>
              </div>
              <StatusBadge status={sys.db} />
            </div>
            {sys.dbError && (
              <div className="status-error">⚠ {sys.dbError}</div>
            )}
          </div>

          {allOk && (
            <div className="all-ok-banner">
              ✓ All systems operational — M0 foundation is ready
            </div>
          )}
        </section>

        {/* Info Cards */}
        <div className="info-grid">
          <div className="info-card">
            <div className="info-icon">🏗</div>
            <h3>Architecture</h3>
            <p>React + Vite frontend communicating with a FastAPI backend, backed by PostgreSQL on InsForge.</p>
          </div>
          <div className="info-card">
            <div className="info-icon">📍</div>
            <h3>Current Milestone</h3>
            <p>M0 — Foundation only. Authentication, shops, products, cart and orders are implemented in later milestones.</p>
          </div>
          <div className="info-card">
            <div className="info-icon">📦</div>
            <h3>What's Coming</h3>
            <p>M1 Auth → M2 Shopkeeper → M3 Products → M4 Cart → M5 Orders → M6 Payments → M7-M9 Delivery &amp; Invoices.</p>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>LOCOMART • Local Grocery Assistance Platform • M0 Foundation</p>
      </footer>
    </div>
  )
}

export default App
