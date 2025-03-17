import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/ui/sidebar'
import { ArrowLeft } from 'lucide-react'
import { Link, Outlet } from 'react-router'

export default function SettingsLayout() {
  return (
    <>
      <Sidebar>
        <div className="flex flex-col gap-4">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft className="size-4 mr-2" />
              Home
            </Link>
          </Button>
          <div className="flex flex-col gap-2">
            <Button asChild variant="ghost" className="justify-start">
              <Link to="/settings/accounts">Accounts</Link>
            </Button>
            <Button asChild variant="ghost" className="justify-start">
              <Link to="/settings/models">Models</Link>
            </Button>
          </div>
        </div>
      </Sidebar>
      <div className="flex flex-col gap-4 p-4 w-full">
        <Outlet />
      </div>
    </>
  )
}
