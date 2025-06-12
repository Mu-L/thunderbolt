import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenuButton, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSideview } from '@/sideview/provider'
import { Menu, Sidebar } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ImperativePanelHandle } from 'react-resizable-panels'
import { Outlet } from 'react-router'
import ChatSidebar from './sidebar'
import { Sideview } from './sideview'

function HeaderContent() {
  const { open } = useSidebar()
  const isMobile = useIsMobile()
  
  return (
    <>
      {isMobile ? (
        <SidebarTrigger className="cursor-pointer">
          <Menu className="h-5 w-5" />
        </SidebarTrigger>
      ) : (
        !open && <SidebarTrigger className="cursor-pointer" />
      )}
    </>
  )
}

export default function Page() {
  const ref = useRef<ImperativePanelHandle>(null)
  const { sideviewId, setSideview } = useSideview()

  useEffect(() => {
    if (sideviewId) {
      ref.current?.expand()
    } else {
      ref.current?.collapse()
    }
  }, [sideviewId])

  return (
    <>
      <ChatSidebar />
      <SidebarInset className="h-full overflow-hidden flex flex-col">
        <ResizablePanelGroup direction="horizontal" autoSaveId="sideview" className="h-full">
          <ResizablePanel>
            <div className="flex flex-col h-full">
              <header className="flex h-12 w-full items-center px-4 flex-shrink-0">
                <HeaderContent />
              </header>
              <div className="flex-1 overflow-hidden">
                <Outlet />
              </div>
            </div>
          </ResizablePanel>
          {sideviewId && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel ref={ref} collapsible defaultSize={20} minSize={15} onCollapse={() => setSideview(null, null)}>
                <SidebarHeader>
                  <SidebarGroup>
                    <SidebarGroupContent className="flex justify-end w-full flex-1 items-center">
                      <SidebarMenuButton onClick={() => ref?.current?.collapse()} className="w-fit pr-0 pl-0 aspect-square items-center justify-center cursor-pointer" tooltip="New Chat">
                        <Sidebar />
                      </SidebarMenuButton>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </SidebarHeader>
                <SidebarContent className="w-full h-full overflow-scroll">
                  <Sideview />
                </SidebarContent>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </SidebarInset>
    </>
  )
}
