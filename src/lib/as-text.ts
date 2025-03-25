import { EmailMessage, EmailThread } from '@/types'

export const indentUserText = (text: string): string => {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}

export const messageAsText = (message: EmailMessage) => {
  return `*At ${message.date} ${message.from} wrote:*
${indentUserText(message.text_body)}`
}

export const threadAsText = (thread: EmailThread, messages: EmailMessage[]) => {
  return `
Type: Email Thread
Subject: ${thread.subject}
Date: ${thread.date}
Messages:

${messages.map((message) => messageAsText(message)).join('\n\n')}
`
}
