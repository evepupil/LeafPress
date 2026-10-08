"use client"

import { useEffect, useState } from "react"

import type { Work, WorkDetail } from "@leafpress/core"
import { loadWorkDetail } from "@/state/actions/works"

interface DetailState {
  id: string
  updatedAt: string
  detail?: WorkDetail
  error?: string
}

export function useWorkDetail(work: Work | undefined): { detail?: WorkDetail; error?: string; loading: boolean } {
  const [state, setState] = useState<DetailState | undefined>()
  const id = work?.id
  const updatedAt = work?.updatedAt
  useEffect(() => {
    if (!id || !updatedAt) return
    let current = true
    void loadWorkDetail(id)
      .then((detail) => {
        if (current) setState({ id, updatedAt, detail })
      })
      .catch((error: unknown) => {
        if (current) setState({ id, updatedAt, error: error instanceof Error ? error.message : "读取作品详情失败" })
      })
    return () => {
      current = false
    }
  }, [id, updatedAt])
  if (!state || state.id !== id || state.updatedAt !== updatedAt) return { loading: Boolean(id) }
  return { detail: state.detail, error: state.error, loading: state.detail === undefined && state.error === undefined }
}
