import { getEmailThreadByIdWithMessages, getEmailThreadByMessageIdWithMessages, getEmailThreadByMessageImapIdWithMessages } from '@/dal'
import { useDatabase } from '@/hooks/use-database'
import { useSideview } from '@/sideview/provider'
import { EmailThreadView } from '@/sideview/thread'
import { useQuery } from '@tanstack/react-query'

export function Sideview({}: {}) {
  const { sideviewId, sideviewType } = useSideview()
  const { db } = useDatabase()

  console.log('sideviewType', sideviewType, sideviewId)

  const { data: object } = useQuery({
    queryKey: ['sideview', sideviewType, sideviewId],
    queryFn: async () => {
      if (!sideviewId || !sideviewType) return null

      switch (sideviewType) {
        case 'message':
          return await getEmailThreadByMessageIdWithMessages(db, sideviewId)
        case 'imap':
          return await getEmailThreadByMessageImapIdWithMessages(db, sideviewId)
        case 'thread':
          return await getEmailThreadByIdWithMessages(db, sideviewId)
        default:
          return null
      }
    },
    enabled: !!sideviewId && !!sideviewType,
  })

  switch (sideviewType) {
    case 'imap':
      return (
        <div>
          IMAP {object?.id} {object?.messages.length}
        </div>
      )
    case 'message':
      return <EmailThreadView />
    case 'thread':
      return <EmailThreadView />
    default:
      return <div>Unsupported sideview type</div>
  }
}
