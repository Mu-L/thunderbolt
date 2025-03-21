import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useDrizzle } from '@/db/provider'
import { search } from '@/lib/embeddings'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

const searchFormSchema = z.object({
  searchText: z.string().min(1, 'Please enter search text'),
  limit: z.number().min(1).max(100),
})

type SearchFormValues = z.infer<typeof searchFormSchema>

export default function SearchSection() {
  const { db } = useDrizzle()
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const [results, setResults] = useState<any[]>([])
  const [status, setStatus] = useState<string>('')

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      searchText: '',
      limit: 5,
    },
  })

  const handleSearch = async (values: SearchFormValues) => {
    setIsSearching(true)
    setStatus('Searching...')
    try {
      const searchResults = await search(db, values.searchText, values.limit)
      console.log(searchResults)
      setResults(searchResults)
      setStatus('')
    } catch (error) {
      console.error('Error searching:', error)
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Semantic Search</CardTitle>
        <CardDescription>Search for email messages using semantic similarity</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSearch)} className="space-y-4">
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="searchText"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input {...field} placeholder="Enter search text" disabled={isSearching} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Limit:</span>
                <FormField
                  control={form.control}
                  name="limit"
                  render={({ field }) => (
                    <FormItem className="w-16">
                      <FormControl>
                        <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} className="p-1 text-sm" min="1" max="100" disabled={isSearching} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" disabled={isSearching}>
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </form>
        </Form>

        {status && (
          <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
            <div className="text-sm">{status}</div>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Results</h3>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-4 overflow-auto max-h-96">
              <Accordion type="single" className="w-full">
                {results.map((result, index) => (
                  <AccordionItem key={index} value={`item-${index}`} className={`mb-2 ${index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-850' : 'bg-white dark:bg-gray-900'}`}>
                    <AccordionTrigger className="px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-t-md w-full">
                      <div className="grid grid-cols-4 w-full text-left">
                        <div className="flex items-center">
                          <div className="w-12 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mr-2">
                            <div className="h-full bg-green-500" style={{ width: `${(1 - (result.distance || 0)) * 100}%` }} />
                          </div>
                          <span className="text-sm">{(1 - (result.distance || 0)).toFixed(3)}</span>
                        </div>
                        <div className="text-sm font-medium truncate max-w-[200px]">{result.email_message?.subject || 'No subject'}</div>
                        <div className="text-sm truncate max-w-[200px]">{result.email_message?.from || 'Unknown'}</div>
                        <div className="text-sm whitespace-nowrap">{result.email_message?.date ? new Date(result.email_message.date).toLocaleString() : 'Unknown date'}</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-white dark:bg-gray-900 p-4 rounded-b-md border border-gray-200 dark:border-gray-700">
                      <div className="whitespace-pre-wrap">{result.email_message?.text_body || 'No message content available'}</div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
