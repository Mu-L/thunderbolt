import { FileText } from 'lucide-react'

type DocumentResultWidgetProps = {
  name: string
  fileId: string
  snippet?: string
  score?: string
  messageId: string
}

/**
 * Renders a source document card from Haystack search results.
 * Shows file name, content snippet, and relevance score.
 */
export const DocumentResultWidget = ({ name, snippet, score }: DocumentResultWidgetProps) => {
  const relevancePercent = score ? Math.round(Number.parseFloat(score) * 100) : null

  return (
    <div className="my-2 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-md bg-muted p-1.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            {relevancePercent !== null && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {relevancePercent}%
              </span>
            )}
          </div>
          {snippet && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{snippet}</p>}
        </div>
      </div>
    </div>
  )
}

export { DocumentResultWidget as Component }
