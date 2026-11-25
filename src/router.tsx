import { Fragment, lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, useLocation } from 'react-router'
import { FullScreenLoader } from './components/layout/FullScreenLoader'
import { DriveLayout } from './components/layout/DriveLayout'
import { Explorer } from './components/explorer/Explorer'
import { useDrives } from './store/drives'

const Landing = lazy(() => import('./pages/Landing'))
const Connect = lazy(() => import('./pages/Connect'))
const SharePage = lazy(() => import('./pages/SharePage'))
const JoinPage = lazy(() => import('./pages/JoinPage'))

const suspense = (node: ReactNode) => <Suspense fallback={<FullScreenLoader />}>{node}</Suspense>

/** Opening another link while one is shown (deep link, paste) must start that page fresh. */
function KeyedByHash({ children }: { children: ReactNode }) {
  return <Fragment key={useLocation().hash}>{children}</Fragment>
}

function Home() {
  const hasDrive = useDrives((s) => s.profiles.length > 0)
  return hasDrive ? <Navigate to="/drive" replace /> : suspense(<Landing />)
}

export const router = createBrowserRouter(
  [
    { path: '/', element: <Home /> },
    { path: '/welcome', element: suspense(<Landing />) },
    { path: '/connect', element: suspense(<Connect />) },
    { path: '/share', element: <KeyedByHash>{suspense(<SharePage />)}</KeyedByHash> },
    { path: '/join', element: <KeyedByHash>{suspense(<JoinPage />)}</KeyedByHash> },
    {
      path: '/drive',
      element: <DriveLayout />,
      children: [
        { index: true, element: <Explorer view="folder" /> },
        { path: 'f/:folderId', element: <Explorer view="folder" /> },
        { path: 'recent', element: <Explorer view="recent" /> },
        { path: 'starred', element: <Explorer view="starred" /> },
        { path: 'trash', element: <Explorer view="trash" /> },
        { path: 'search', element: <Explorer view="search" /> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)
