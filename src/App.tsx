import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProfileGate } from './components/ProfileGate'
import { HomePage } from './pages/HomePage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { ProfileProvider } from './ProfileProvider'

const BilliardsPage = lazy(() => import('./pages/BilliardsPage').then((module) => ({ default: module.BilliardsPage })))
const YachtPage = lazy(() => import('./pages/YachtPage').then((module) => ({ default: module.YachtPage })))

function GameLoading() {
  return <div className="game-loading"><span className="button-loader" /> 3D TABLE LOADING</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <ProfileProvider>
        <ProfileGate />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="play/three-cushion" element={<Suspense fallback={<GameLoading />}><BilliardsPage mode="three-cushion" /></Suspense>} />
            <Route path="play/four-ball" element={<Suspense fallback={<GameLoading />}><BilliardsPage mode="four-ball" /></Suspense>} />
            <Route path="play/yacht" element={<Suspense fallback={<GameLoading />}><YachtPage /></Suspense>} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ProfileProvider>
    </BrowserRouter>
  )
}
