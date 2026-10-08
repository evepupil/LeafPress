"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ACCOUNT_SUMMARIES } from "@/lib/metrics"
import { AccountCard, NewAccountCard } from "./accounts-grid-card"
import { AddAccountDialog, type NewAccount } from "./accounts-grid-dialog"

/**
 * A1 账号卡片：每个账号一张卡，点进详情；右上角可以先把新账号占个位。
 * 新加的账号只存在这一页的内存里，卡片追加在网格最后，刷新就没了。
 */
export function AccountsGrid() {
  const [added, setAdded] = useState<NewAccount[]>([])
  const [open, setOpen] = useState(false)
  // 每次打开让弹窗换一个 key，表单就是一份新的，上次没提交的内容不会留下
  const [formKey, setFormKey] = useState(0)

  const openDialog = () => {
    setFormKey((current) => current + 1)
    setOpen(true)
  }

  const addAccount = (account: NewAccount) => {
    setAdded((current) => [...current, account])
    toast.success("加好了")
  }

  return (
    <section id="accounts" aria-labelledby="accounts-title">
      <div className="flex h-8 items-center gap-2 pb-1">
        <h2 id="accounts-title" className="text-sm font-medium">
          全部账号
        </h2>
        <span className="text-sm text-fg-2 tabular" data-accounts-count>
          {ACCOUNT_SUMMARIES.length + added.length}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={openDialog} data-add-account>
          <Plus />
          加账号
        </Button>
      </div>
      <div className="grid gap-(--gap-card) sm:grid-cols-2 xl:grid-cols-3">
        {ACCOUNT_SUMMARIES.map((summary) => (
          <AccountCard key={summary.account.id} summary={summary} />
        ))}
        {added.map((account, index) => (
          // 只会往后追加、不会删除，所以序号就是稳定的编号
          <NewAccountCard key={`new-${index + 1}`} n={index + 1} account={account} />
        ))}
      </div>
      <AddAccountDialog key={formKey} open={open} onOpenChange={setOpen} onAdd={addAccount} />
    </section>
  )
}

export default AccountsGrid
