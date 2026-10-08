"use client"

import { accountSummary, type Account, type AccountSummary } from "@leafpress/core"
import { Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"
import { addAccount } from "@/state/actions/accounts"
import { useAccounts, useMetricsInput } from "@/state/data"
import { AccountCard } from "./accounts-grid-card"
import { AddAccountDialog, type NewAccount } from "./accounts-grid-dialog"

function summariesFor(accounts: Account[], input: Parameters<typeof accountSummary>[0] | undefined): AccountSummary[] {
  return input ? accounts.map((account) => accountSummary(input, account)) : []
}

/** 账号卡片：账号与统计都来自本机服务。 */
export function AccountsGrid() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const accounts = useAccounts()
  const input = useMetricsInput()
  const summaries = useMemo(() => summariesFor(accounts, input), [accounts, input])
  const [open, setOpen] = useState(() => searchParams.get("add") === "1")
  const [formKey, setFormKey] = useState(0)

  const openDialog = () => {
    setFormKey((current) => current + 1)
    setOpen(true)
  }

  useEffect(() => {
    if (searchParams.get("add") === "1") router.replace("/accounts/", { scroll: false })
  }, [router, searchParams])

  const onAdd = async (account: NewAccount): Promise<boolean> => {
    try {
      const created = await addAccount(account)
      toast.success("加好了")
      router.push(`/account/?id=${encodeURIComponent(created.id)}`)
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : "添加账号失败")
      return false
    }
  }

  return (
    <section id="accounts" aria-labelledby="accounts-title">
      <div className="flex h-8 items-center gap-2 pb-1">
        <h2 id="accounts-title" className="text-sm font-medium">
          全部账号
        </h2>
        <span className="text-sm text-fg-2 tabular" data-accounts-count>
          {accounts.length}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={openDialog} data-add-account>
          <Plus />
          加账号
        </Button>
      </div>
      {summaries.length > 0 ? (
        <div className="grid gap-(--gap-card) sm:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <AccountCard key={summary.account.id} summary={summary} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={accounts.length === 0 ? "还没有账号" : "暂无账号数据"}
          action={
            accounts.length === 0 ? (
              <Button variant="outline" size="sm" onClick={openDialog} data-empty-add-account>
                <Plus />
                加账号
              </Button>
            ) : undefined
          }
        />
      )}
      <AddAccountDialog key={formKey} open={open} onOpenChange={setOpen} onAdd={onAdd} />
    </section>
  )
}

export default AccountsGrid
