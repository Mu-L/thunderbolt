/**
 * AI Instructions for the document-result widget
 */
export const instructions = `## Document Result
<widget:document-result name="filename.pdf" fileId="uuid" snippet="relevant text excerpt" score="0.95" />
Shows a source document card with file name, content snippet, and relevance score.
Used in Document Search mode to display source references for grounded answers.

### Usage Rules
- Only use in Document Search mode responses
- name: the source file name (e.g., "report.pdf")
- fileId: the unique file identifier from the document search
- snippet: a brief excerpt of relevant content from the document (optional)
- score: relevance score as a string (optional, e.g., "0.85")`
