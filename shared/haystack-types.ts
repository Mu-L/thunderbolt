export type HaystackFile = {
  id: string
  name: string
}

export type HaystackDocumentMeta = {
  id: string
  content: string
  score: number
  file: HaystackFile
}

export type HaystackReferenceMeta = {
  position: number
  fileId: string
  fileName: string
  pageNumber?: number
}
