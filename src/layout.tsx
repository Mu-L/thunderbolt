import { Outlet } from 'react-router'
import './index.css'

export default function Layout() {
  return (
    <main className="flex flex-col h-[100dvh] w-full overflow-hidden">
      <Outlet />
    </main>
  )
}
