import { Routes, Route, Navigate } from 'react-router'
import AppLayout from './AppLayout'
import AgentPage from '@/pages/AgentPage'
import ParsePage from '@/pages/ParsePage'
import TasksPage from '@/pages/TasksPage'
import LibraryPage from '@/pages/LibraryPage'
import ReadingPage from '@/pages/ReadingPage'
import SettingsPage from '@/pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<AgentPage />} />
        <Route path="parse" element={<ParsePage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="read/:uploadId" element={<ReadingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
