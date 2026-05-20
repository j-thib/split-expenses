import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import AuthPage from './pages/AuthPage'
import GroupListPage from './pages/GroupListPage'
import GroupDetailPage from './pages/GroupDetailPage'
import GroupSettingsPage from './pages/GroupSettingsPage'
import { CenteredSpinner } from './components/Spinner'
import type { Group } from './lib/database.types'

type Route =
  | { name: 'list' }
  | { name: 'detail'; group: Group }
  | { name: 'settings'; group: Group }

function App() {
  const { user, loading } = useAuth()
  const [route, setRoute] = useState<Route>({ name: 'list' })

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-app">
        <CenteredSpinner label="Loading session" />
      </main>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  if (route.name === 'settings') {
    return (
      <GroupSettingsPage
        group={route.group}
        onBack={() => setRoute({ name: 'detail', group: route.group })}
        onLeft={() => setRoute({ name: 'list' })}
        onGroupUpdated={(updated) =>
          setRoute({ name: 'settings', group: updated })
        }
      />
    )
  }

  if (route.name === 'detail') {
    return (
      <GroupDetailPage
        group={route.group}
        onBack={() => setRoute({ name: 'list' })}
        onOpenSettings={() =>
          setRoute({ name: 'settings', group: route.group })
        }
      />
    )
  }

  return (
    <GroupListPage
      onSelectGroup={(group) => setRoute({ name: 'detail', group })}
    />
  )
}

export default App
